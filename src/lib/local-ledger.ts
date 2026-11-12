import {
  collection,
  doc,
  getDocsFromCache,
  getDocsFromServer,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  waitForPendingWrites,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
  type QuerySnapshot,
  type Timestamp,
} from "firebase/firestore";
import { auth, db, firestoreReady, offlineEnabled } from "./firebase";
import { LedgerMirror, type RawDoc } from "./ledger-sync";
import {
  newId,
  recordSchema,
  type LedgerRecord,
  type Mutation,
} from "./ledger";

function ledgerCollection() {
  const user = auth.currentUser;
  if (!user) throw new Error("Accedi per aprire il tuo archivio.");

  return collection(db, "users", user.uid, "ledger");
}

/*
 * Come si risparmiano le letture Firestore (ogni documento letto dal server = 1 lettura):
 *
 * - Ogni documento salvato porta `updatedAt` (ora del server). L'app ricorda il
 *   valore più recente già visto e al server chiede solo i documenti più nuovi
 *   (minimo 1 lettura per richiesta, anche se non è cambiato nulla).
 * - Le eliminazioni sono "lapidi" (`deleted: true`): così anche loro arrivano
 *   agli altri dispositivi con la lettura incrementale.
 * - Con "Uso offline" la copia resta nel browser anche chiudendo l'app, quindi
 *   l'intero archivio si scarica solo la prima volta su ogni dispositivo.
 *   Senza, la copia vive in memoria: si risparmia finché la pagina resta aperta.
 * - Ogni 30 giorni si rilegge tutto, per sicurezza.
 */

const FULL_SYNC_EVERY_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 400; // Firestore accetta al massimo 500 scritture per batch.

let mirror: { uid: string; data: LedgerMirror<Timestamp> } | null = null;

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

/** Documento che sostituisce una voce eliminata. */
function tombstone(target: { kind: string; id: string }) {
  return { kind: target.kind, id: target.id, version: newId(), value: {}, deleted: true, updatedAt: serverTimestamp() };
}

function stamped<T extends object>(record: T) {
  return { ...record, updatedAt: serverTimestamp() };
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// ---- Stato della sincronizzazione (scritture in attesa quando si è offline) ----

let pending = 0;
const listeners = new Set<(pending: number) => void>();

function setPending(next: number) {
  pending = Math.max(0, next);
  for (const listener of listeners) listener(pending);
}

export function pendingWrites() {
  return pending;
}

export function subscribePending(listener: (pending: number) => void) {
  listeners.add(listener);
  listener(pending);
  return () => { listeners.delete(listener); };
}

/** Con l'uso offline una scrittura senza rete resta in coda: non si aspetta il server. */
function track(write: Promise<unknown>) {
  setPending(pending + 1);
  write
    .catch((error) => console.warn("Sincronizzazione non riuscita:", error))
    .finally(() => setPending(pending - 1));
}

/** Attende che le scritture in coda arrivino al server, al massimo per `ms` millisecondi. */
export async function flushPending(ms = 4000) {
  if (!pending) return true;
  const done = waitForPendingWrites(db).then(() => true, () => false);
  const timeout = new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), ms));
  return Promise.race([done, timeout]);
}

// ---- Lettura e scrittura ----

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
  await firestoreReady;
  const ref = ledgerCollection();
  const uid = auth.currentUser!.uid;

  if (!mirror || mirror.uid !== uid) {
    const data = new LedgerMirror<Timestamp>();
    if (offlineEnabled) {
      // Copia salvata sul dispositivo: leggerla non costa letture Firestore.
      try { data.apply(rawDocs(await getDocsFromCache(ref))); } catch {}
    }
    mirror = { uid, data };
  }
  const { data } = mirror;

  if (offlineEnabled && isOffline()) {
    // Senza rete: la copia locale, comprese le modifiche ancora in coda.
    data.reset();
    data.apply(rawDocs(await getDocsFromCache(ref)));
    return data.records();
  }

  try {
    if (data.cursor && data.size && !fullSyncDue(uid)) {
      data.apply(rawDocs(await getDocsFromServer(query(ref, where("updatedAt", ">", data.cursor)))));
    } else {
      await fullSync(uid, ref, data);
    }
  } catch (error) {
    // Con l'uso offline, se il server non risponde si mostra la copia locale.
    if (offlineEnabled && data.size) return data.records();
    throw error;
  }
  return data.records();
}

/** Scrittura singola con controllo dei conflitti tra dispositivi (richiede la rete). */
export async function writeLedger(action: Mutation) {
  await firestoreReady;
  const target = action.op === "save" ? action.record : action;
  const ref = doc(ledgerCollection(), `${target.kind}:${target.id}`);

  if (offlineEnabled && isOffline()) {
    // Offline il controllo dei conflitti non è possibile: vince l'ultima modifica.
    if (action.op === "delete") {
      track(setDoc(ref, tombstone(target)));
      return null;
    }
    const saved = { ...action.record, version: newId() };
    track(setDoc(ref, stamped(saved)));
    return saved;
  }

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
      // Lapide invece della cancellazione: gli altri dispositivi lo scoprono
      // leggendo solo ciò che è cambiato.
      transaction.set(ref, tombstone(target));
      return null;
    }

    const saved = { ...action.record, version: newId() };
    transaction.set(ref, stamped(saved));
    return saved;
  });
}

/**
 * Più scritture insieme (spostamenti, rinomine, importazioni, ricorrenti).
 * Restituisce le voci salvate con la nuova versione.
 */
export async function writeMany(actions: Mutation[], onProgress?: (done: number, total: number) => void) {
  await firestoreReady;
  const collectionRef = ledgerCollection();
  const saved: LedgerRecord[] = [];
  for (let start = 0; start < actions.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const action of actions.slice(start, start + BATCH_SIZE)) {
      const target = action.op === "save" ? action.record : action;
      const ref: DocumentReference = doc(collectionRef, `${target.kind}:${target.id}`);
      if (action.op === "delete") {
        batch.set(ref, tombstone(target));
      } else {
        const record = { ...action.record, version: newId() };
        batch.set(ref, stamped(record));
        saved.push(record);
      }
    }
    if (offlineEnabled && isOffline()) track(batch.commit());
    else await batch.commit();
    onProgress?.(Math.min(start + BATCH_SIZE, actions.length), actions.length);
  }
  return saved;
}
