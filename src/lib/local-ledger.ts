import {
  collection,
  doc,
  getDocsFromServer,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "./firebase";
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

export async function readLedger(): Promise<LedgerRecord[]> {
  const snapshot = await getDocsFromServer(ledgerCollection());
  const records: LedgerRecord[] = [];
  for (const entry of snapshot.docs) {
    // Un documento malformato non deve bloccare l'intero archivio.
    const parsed = recordSchema.safeParse(entry.data());
    if (parsed.success) records.push(parsed.data);
    else console.warn("Voce ignorata perché non valida:", entry.id);
  }
  return records;
}

export async function writeLedger(action: Mutation) {
  const target = action.op === "save" ? action.record : action;
  const ref = doc(ledgerCollection(), `${target.kind}:${target.id}`);

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
