import { NO_VERSION, recordYear, type Archive, type Ledger, type LedgerRecord, type Mutation } from "./ledger";

/*
 * Archivio annuale.
 *
 * A ogni apertura l'app legge tutti i documenti da Firestore (piano gratuito: 50.000 letture al giorno).
 * Dopo molti anni i movimenti sarebbero migliaia: qui gli anni chiusi diventano pochi documenti
 * "archive" (uno ogni ~800 KB), così si leggono pochi documenti invece di migliaia.
 * Le voci archiviate restano visibili in tutta l'app, ma in sola lettura finché non riapri l'anno.
 */

/** Gli ultimi anni restano sempre modificabili: si archiviano solo quelli più vecchi di così. */
export const KEEP_OPEN_YEARS = 2;
// Firestore accetta documenti fino a 1 MiB: si resta ben sotto, contando i byte in UTF-8.
const MAX_PART_BYTES = 800_000;
export const FREE_DAILY_READS = 50_000;

const encoder = new TextEncoder();

/** Anni che si possono archiviare: chiusi da almeno KEEP_OPEN_YEARS anni e non ancora archiviati. */
export function archivableYears(ledger: Ledger, today: string): { year: number; count: number }[] {
  const limit = Number(today.slice(0, 4)) - KEEP_OPEN_YEARS;
  const counts = new Map<number, number>();
  for (const record of [...ledger.movements, ...ledger.balances]) {
    const year = recordYear(record);
    if (year === null || year >= limit || ledger.archivedYears.has(year)) continue;
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return [...counts].map(([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);
}

/** Divide le voci in parti che stanno in un documento Firestore. */
export function splitParts(records: LedgerRecord[], maxBytes = MAX_PART_BYTES): LedgerRecord[][] {
  const parts: LedgerRecord[][] = [];
  let current: LedgerRecord[] = [];
  let size = 0;
  for (const record of records) {
    const bytes = encoder.encode(JSON.stringify(record)).length + 1;
    if (current.length && size + bytes > maxBytes) { parts.push(current); current = []; size = 0; }
    current.push(record);
    size += bytes;
  }
  if (current.length) parts.push(current);
  return parts;
}

/**
 * Scritture per archiviare un anno: prima i documenti d'archivio, poi le eliminazioni definitive
 * delle singole voci. Se il salvataggio si interrompe a metà nulla si perde: una voce presente
 * sia viva sia in archivio vale una volta sola (prevale quella viva).
 */
export function archiveActions(ledger: Ledger, year: number): Mutation[] {
  const records = [...ledger.movements, ...ledger.balances].filter((record) => recordYear(record) === year);
  if (!records.length) return [];
  // Anno già archiviato ma interrotto a metà: restano da eliminare le voci ancora vive (sono già nell'archivio).
  if (ledger.archivedYears.has(year)) return leftoverDeletes(ledger, year);
  const parts = splitParts(records);
  const saves: Mutation[] = parts.map((part, index) => ({
    op: "save",
    record: { kind: "archive", id: `${year}-${index}`, version: null, value: { year, part: index, parts: parts.length, records: part } },
  }));
  const deletes: Mutation[] = records.map((record) => ({
    op: "delete", kind: record.kind, id: record.id, version: record.version ?? NO_VERSION, trash: {},
  }));
  return [...saves, ...deletes];
}

/** Voci di un anno archiviato rimaste anche come documenti vivi (archiviazione interrotta). */
export function leftovers(ledger: Ledger, year: number) {
  return [...ledger.movements, ...ledger.balances].filter((record) => recordYear(record) === year && !ledger.fromArchive.has(`${record.kind}:${record.id}`));
}

function leftoverDeletes(ledger: Ledger, year: number): Mutation[] {
  return leftovers(ledger, year).map((record) => ({ op: "delete", kind: record.kind, id: record.id, version: record.version ?? NO_VERSION, trash: {} }));
}

/** Scritture per riaprire un anno: le voci tornano singole, poi spariscono i documenti d'archivio. */
export function reopenActions(ledger: Ledger, year: number): Mutation[] {
  const archives = ledger.archives.filter((archive) => archive.value.year === year);
  if (!archives.length) return [];
  const records = [...ledger.movements, ...ledger.balances].filter((record) => recordYear(record) === year);
  // Le voci solo in archivio tornano come nuove (versione null); quelle ancora vive si riscrivono con la loro versione.
  const saves: Mutation[] = records.map((record) => ({
    op: "save", record: { ...record, version: ledger.fromArchive.has(`${record.kind}:${record.id}`) ? null : record.version },
  }));
  const deletes: Mutation[] = archives.map((archive: Archive) => ({
    op: "delete", kind: "archive", id: archive.id, version: archive.version ?? NO_VERSION, trash: {},
  }));
  return [...saves, ...deletes];
}

/** Stima delle letture giornaliere: ogni apertura legge tutti i documenti (più 1 per ogni controllo). */
export function estimateReads(documents: number, opensPerDay: number) {
  const perDay = documents * opensPerDay + opensPerDay * 10;
  return { perDay, share: perDay / FREE_DAILY_READS };
}

/** Errore se una scrittura tocca un anno archiviato (sola lettura). */
export function archivedYearOf(ledger: Ledger, actions: Mutation[]): number | null {
  const byKey = new Map([...ledger.movements, ...ledger.balances].map((record) => [`${record.kind}:${record.id}`, record]));
  for (const action of actions) {
    const candidates: LedgerRecord[] = [];
    if (action.op === "save") candidates.push(action.record);
    const existing = byKey.get(action.op === "save" ? `${action.record.kind}:${action.record.id}` : `${action.kind}:${action.id}`);
    if (existing) candidates.push(existing);
    for (const record of candidates) {
      const year = recordYear(record);
      if (year !== null && ledger.archivedYears.has(year)) return year;
    }
  }
  return null;
}
