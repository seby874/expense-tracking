import {
  collection,
  doc,
  getDocsFromServer,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
  type QuerySnapshot,
  type Timestamp,
} from "firebase/firestore";
import { auth, db, firestoreReady } from "./firebase";
import { LedgerMirror, planWrite, type RawDoc, type TrashItem } from "./ledger-sync";
import { newId, type LedgerRecord, type Mutation } from "./ledger";

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
 *   agli altri dispositivi con la lettura incrementale. Le lapidi vuote più
 *   vecchie di TOMBSTONE_DAYS giorni si cancellano davvero, per non rileggerle.
 * - La copia vive in memoria: all'apertura si scarica l'archivio, poi solo le modifiche.
 * - Se la pagina resta aperta a lungo, ogni 30 giorni si rilegge tutto, per sicurezza.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FULL_SYNC_EVERY_MS = 30 * DAY_MS;
// Più dell'intervallo della rilettura completa: ogni dispositivo ha già visto la lapide prima che sparisca.
const TOMBSTONE_DAYS = 60;
const BATCH_SIZE = 400; // Firestore accetta al massimo 500 scritture per batch.
// Fino a questo numero di voci si scrive con una transazione che controlla i conflitti tra dispositivi
// (Firestore accetta al massimo 500 scritture per transazione).
export const TRANSACTION_LIMIT = 450;

let mirror: { uid: string; data: LedgerMirror<Timestamp>; fullSyncAt: number } | null = null;

function rawDocs(snapshot: QuerySnapshot): RawDoc[] {
  return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));
}

/** Documento che sostituisce una voce eliminata: conserva il contenuto per il cestino (vuoto = eliminazione definitiva). */
function tombstone(target: { kind: string; id: string }, value: Record<string, unknown> = {}) {
  return { kind: target.kind, id: target.id, version: newId(), value, deleted: true, updatedAt: serverTimestamp() };
}

export type LedgerSnapshot = { records: LedgerRecord[]; trash: TrashItem[] };

function stamped<T extends object>(record: T) {
  return { ...record, updatedAt: serverTimestamp() };
}

function docRef(collectionRef: CollectionReference, action: Mutation): DocumentReference {
  const target = action.op === "save" ? action.record : action;
  return doc(collectionRef, `${target.kind}:${target.id}`);
}

// ---- Lettura ----

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

/** Cancella dal server le lapidi vuote più vecchie di TOMBSTONE_DAYS giorni (richiede le regole aggiornate). */
async function purgeTombstones(ref: CollectionReference, data: LedgerMirror<Timestamp>) {
  const stale = data.staleTombstones(Date.now() - TOMBSTONE_DAYS * DAY_MS);
  if (!stale.length) return;
  try {
    for (let start = 0; start < stale.length; start += BATCH_SIZE) {
      const ids = stale.slice(start, start + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const id of ids) batch.delete(doc(ref, id));
      await batch.commit();
      data.forget(ids);
    }
  } catch (error) {
    // Di solito: regole Firestore non ancora aggiornate. Non è grave: si riproverà alla prossima apertura.
    console.warn("Pulizia delle voci eliminate non riuscita: pubblica le nuove regole Firestore.", error);
  }
}

async function fullSync(ref: CollectionReference, data: LedgerMirror<Timestamp>) {
  data.reset();
  data.apply(rawDocs(await getDocsFromServer(ref)));

  if (data.legacy.size) {
    try {
      await stampLegacy(ref, [...data.legacy]);
    } catch (error) {
      // Di solito: regole Firestore non ancora aggiornate. L'app funziona lo
      // stesso, ma finché non riesce rilegge tutto a ogni sincronizzazione.
      console.warn("Aggiornamento dei documenti non riuscito: pubblica le nuove regole Firestore.", error);
      return false;
    }
    data.reset();
    data.apply(rawDocs(await getDocsFromServer(ref)));
  }
  void purgeTombstones(ref, data);
  return true;
}

export async function readLedger(): Promise<LedgerSnapshot> {
  await firestoreReady;
  const ref = ledgerCollection();
  const uid = auth.currentUser!.uid;

  if (!mirror || mirror.uid !== uid) mirror = { uid, data: new LedgerMirror<Timestamp>(), fullSyncAt: 0 };
  const current = mirror;
  const { data } = current;

  if (data.cursor && data.size && Date.now() - current.fullSyncAt < FULL_SYNC_EVERY_MS) {
    data.apply(rawDocs(await getDocsFromServer(query(ref, where("updatedAt", ">", data.cursor)))));
  } else if (await fullSync(ref, data)) {
    current.fullSyncAt = Date.now();
  }
  return { records: data.records(), trash: data.trashed() };
}

// ---- Scrittura ----

/**
 * Scritture con controllo dei conflitti: in un'unica transazione si rileggono le voci
 * e si salva solo se nessun altro dispositivo le ha cambiate nel frattempo (vedi planWrite).
 */
async function writeChecked(collectionRef: CollectionReference, actions: Mutation[]) {
  return runTransaction(db, async (transaction) => {
    const refs = actions.map((action) => docRef(collectionRef, action));
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const saved: LedgerRecord[] = [];

    actions.forEach((action, index) => {
      const stored = snapshots[index].exists() ? snapshots[index].data() : null;
      const plan = planWrite(action, stored);
      if (plan.op === "tombstone") {
        // Lapide invece della cancellazione: gli altri dispositivi lo scoprono leggendo solo ciò che è cambiato.
        const target = action.op === "save" ? action.record : action;
        transaction.set(refs[index], tombstone(target, plan.value));
        return;
      }
      if (action.op !== "save") return;
      const record = { ...action.record, version: newId() };
      transaction.set(refs[index], stamped(record));
      saved.push(record);
    });
    return saved;
  });
}

/** Scritture a blocchi, senza controllo dei conflitti: per ripristini e azzeramenti con molte voci. */
async function writeInBatches(collectionRef: CollectionReference, actions: Mutation[], onProgress?: (done: number, total: number) => void) {
  const saved: LedgerRecord[] = [];
  for (let start = 0; start < actions.length; start += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk: LedgerRecord[] = [];
    for (const action of actions.slice(start, start + BATCH_SIZE)) {
      const ref = docRef(collectionRef, action);
      if (action.op === "delete") {
        batch.set(ref, tombstone(action, action.trash));
      } else {
        const record = { ...action.record, version: newId() };
        batch.set(ref, stamped(record));
        chunk.push(record);
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      console.warn("Salvataggio a blocchi interrotto:", error);
      // Le voci dei blocchi precedenti sono già salvate: ripetere l'operazione completa il lavoro.
      throw new Error(`Salvataggio interrotto dopo ${start.toLocaleString("it-IT")} voci su ${actions.length.toLocaleString("it-IT")}. Controlla la connessione, ricarica e ripeti l’operazione.`);
    }
    saved.push(...chunk);
    onProgress?.(Math.min(start + BATCH_SIZE, actions.length), actions.length);
  }
  return saved;
}

/**
 * Salva una o più modifiche e restituisce le voci salvate con la nuova versione.
 * Fino a TRANSACTION_LIMIT voci il salvataggio è tutto-o-niente e controlla i conflitti.
 */
export async function writeLedger(actions: Mutation[], onProgress?: (done: number, total: number) => void) {
  await firestoreReady;
  const collectionRef = ledgerCollection();
  if (actions.length <= TRANSACTION_LIMIT) return writeChecked(collectionRef, actions);
  return writeInBatches(collectionRef, actions, onProgress);
}
