import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  runTransaction,
  setDoc,
  waitForPendingWrites,
  writeBatch,
} from "firebase/firestore";
import { auth, db, firestoreReady, offlineEnabled } from "./firebase";
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

export async function readLedger(): Promise<LedgerRecord[]> {
  await firestoreReady;
  const source = offlineEnabled
    ? (isOffline() ? getDocsFromCache : getDocs)
    : getDocsFromServer;
  const snapshot = await source(ledgerCollection());
  const records: LedgerRecord[] = [];
  for (const entry of snapshot.docs) {
    // Un documento malformato non deve bloccare l'intero archivio.
    const parsed = recordSchema.safeParse(entry.data());
    if (parsed.success) records.push(parsed.data);
    else console.warn("Voce ignorata perché non valida:", entry.id);
  }
  return records;
}

/** Scrittura singola con controllo dei conflitti tra dispositivi (richiede la rete). */
export async function writeLedger(action: Mutation) {
  await firestoreReady;
  const target = action.op === "save" ? action.record : action;
  const ref = doc(ledgerCollection(), `${target.kind}:${target.id}`);

  if (offlineEnabled && isOffline()) {
    // Offline il controllo dei conflitti non è possibile: vince l'ultima modifica.
    if (action.op === "delete") {
      track(deleteDoc(ref));
      return null;
    }
    const saved = { ...action.record, version: newId() };
    track(setDoc(ref, saved));
    return saved;
  }

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists()
      ? recordSchema.parse(snapshot.data())
      : null;

    if ((current?.version ?? null) !== target.version) {
      throw new Error(
        "La voce è cambiata su un altro dispositivo. Chiudi la modifica e ricarica."
      );
    }

    if (action.op === "delete") {
      transaction.delete(ref);
      return null;
    }

    const saved = { ...action.record, version: newId() };
    transaction.set(ref, saved);
    return saved;
  });
}

const BATCH_SIZE = 400;

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
      const ref = doc(collectionRef, `${target.kind}:${target.id}`);
      if (action.op === "delete") {
        batch.delete(ref);
      } else {
        const record = { ...action.record, version: newId() };
        batch.set(ref, record);
        saved.push(record);
      }
    }
    if (offlineEnabled && isOffline()) track(batch.commit());
    else await batch.commit();
    onProgress?.(Math.min(start + BATCH_SIZE, actions.length), actions.length);
  }
  return saved;
}
