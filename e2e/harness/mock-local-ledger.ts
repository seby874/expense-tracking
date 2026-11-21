// Solo per i test dell'interfaccia: archivio simulato al posto di Firestore.
// ?empty = archivio vuoto; ?shared = archivio condiviso tra le pagine (in localStorage), come due dispositivi.
import { newId, type LedgerRecord, type Mutation } from "../../src/lib/ledger";
import { sampleLedger } from "../../src/lib/ledger-demo";
import type { LedgerSnapshot } from "../../src/lib/local-ledger";

export const TRANSACTION_LIMIT = 450;
const params = new URLSearchParams(location.search);
const SHARED_KEY = "e2e-store";
const shared = params.has("shared");

function load(): LedgerRecord[] {
  if (shared) {
    const saved = localStorage.getItem(SHARED_KEY);
    if (saved) return JSON.parse(saved) as LedgerRecord[];
  }
  return params.has("empty") ? [] : sampleLedger();
}

let store = load();
const persist = () => { if (shared) localStorage.setItem(SHARED_KEY, JSON.stringify(store)); };
persist();

export async function readLedger(): Promise<LedgerSnapshot> {
  if (shared) store = load();
  return { records: store, trash: [], documents: 16, invalid: [] };
}

export async function writeLedger(actions: Mutation[]): Promise<LedgerRecord[]> {
  if (shared) store = load();
  const saved: LedgerRecord[] = [];
  for (const action of actions) {
    const target = action.op === "save" ? action.record : action;
    store = store.filter((item) => !(item.kind === target.kind && item.id === target.id));
    if (action.op === "save") {
      const record = { ...action.record, version: newId() } as LedgerRecord;
      store = [...store, record];
      saved.push(record);
    }
  }
  persist();
  return saved;
}

/** Per i test: cosa c'è nell'archivio simulato. */
(window as unknown as { e2eStore: () => LedgerRecord[] }).e2eStore = () => store;
