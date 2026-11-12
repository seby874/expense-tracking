import {
  collection,
  doc,
  getDocsFromCache,
  getDocsFromServer,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type CollectionReference,
  type QuerySnapshot,
  type Timestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { LedgerMirror, type RawDoc } from "./ledger-sync";
import {
  newId,
  recordSchema,
  type LedgerRecord,
  type Mutation,
} from "./ledger";

/*
 * Come si risparmiano le letture Firestore (ogni documento letto dal server = 1 lettura):
 *
 * - Prima apertura su un dispositivo: si legge tutto una volta (N letture).
 *   I documenti restano nella cache IndexedDB del browser.
 * - Aperture successive, ritorni sulla finestra, nuovo accesso dopo il logout:
 *   si leggono dal server solo i documenti cambiati (minimo 1 lettura per richiesta,
 *   anche se non è cambiato nulla).
 * - Ogni 30 giorni si rilegge tutto, per sicurezza.
 */

const FULL_SYNC_EVERY_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 400; // Firestore accetta al massimo 500 scritture per batch.

let mirror: { uid: string; data: LedgerMirror<Timestamp> } | null = null;

function ledgerCollection() {
  const user = auth.currentUser;
  if (!user) throw new Error("Accedi per aprire il tuo archivio.");

  return { uid: user.uid, ref: collection(db, "users", user.uid, "ledger") };
}

function rawDocs(snapshot: QuerySnapshot): RawDoc[] {
  return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
}

function fullSyncKey(uid: string) {
  return `et-full-sync:${uid}`;
}

function fullSyncDue(uid: string) {
  try {
    const last = Number(window.localStorage.getItem(fullSyncKey(uid)));
    return !(last > 0) || Date.now() - last > FULL_SYNC_EVERY_MS;
  } catch {
    return true;
  }
}

function markFullSync(uid: string) {
  try { window.localStorage.setItem(fullSyncKey(uid), String(Date.now())); } catch {}
}

/** Aggiunge `updatedAt` ai documenti salvati dalle versioni precedenti (una volta sola). */
async function stampLegacy(ref: CollectionReference, ids: string[]) {
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const id of ids.slice(start, start + BATCH_SIZE)) {
      batch.update(doc(ref, id), { updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }
}

async function fullSync(uid: string, ref: CollectionReference, data: LedgerMirror<Timestamp>) {
  data.reset();
  data.apply(rawDocs(await getDocsFromServer(ref)));

  if (data.legacy.size) {
    try {
      await stampLegacy(ref, [...data.legacy]);
    } catch (error) {
      // Di solito: regole Firestore non ancora aggiornate. L'app funziona lo
      // stesso, ma finché non riesce rilegge tutto a ogni apertura.
      console.warn("Aggiornamento dei documenti non riuscito: pubblica le nuove regole Firestore.", error);
      return;
    }
    data.reset();
    data.apply(rawDocs(await getDocsFromServer(ref)));
  }
  markFullSync(uid);
}

export async function readLedger(): Promise<LedgerRecord[]> {
  const { uid, ref } = ledgerCollection();

  if (!mirror || mirror.uid !== uid) {
    const data = new LedgerMirror<Timestamp>();
    try {
      // Lettura dalla cache del dispositivo: non costa letture Firestore.
      data.apply(rawDocs(await getDocsFromCache(ref)));
    } catch {
      // Cache non disponibile: si riparte con una lettura completa.
    }
    mirror = { uid, data };
  }

  const { data } = mirror;
  if (data.cursor && data.size && !fullSyncDue(uid)) {
    data.apply(rawDocs(await getDocsFromServer(query(ref, where("updatedAt", ">", data.cursor)))));
  } else {
    await fullSync(uid, ref, data);
  }
  return data.records();
}

export async function writeLedger(action: Mutation) {
  const target = action.op === "save" ? action.record : action;
  const { ref: ledger } = ledgerCollection();
  const ref = doc(ledger, `${target.kind}:${target.id}`);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const stored = snapshot.exists() ? snapshot.data() : null;
    // Una voce eliminata ("lapide") vale come inesistente.
    const current = stored && stored.deleted !== true ? recordSchema.parse(stored) : null;

    if ((current?.version ?? null) !== target.version) {
      throw new Error(
        "La voce è cambiata su un altro dispositivo. Chiudi la modifica e ricarica."
      );
    }

    if (action.op === "delete") {
      // Si lascia una lapide invece di cancellare il documento, così gli altri
      // dispositivi vengono a saperlo leggendo solo ciò che è cambiato.
      transaction.set(ref, {
        kind: target.kind,
        id: target.id,
        version: newId(),
        value: {},
        deleted: true,
        updatedAt: serverTimestamp(),
      });
      return null;
    }

    const saved = { ...action.record, version: newId() };
    transaction.set(ref, { ...saved, updatedAt: serverTimestamp() });
    return saved;
  });
}
