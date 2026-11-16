import { recordSchema, type LedgerRecord, type Mutation } from "./ledger";

/**
 * Copia in memoria dell'archivio, aggiornata a pezzi.
 *
 * Ogni documento salvato dall'app porta `updatedAt` (ora del server Firestore).
 * Il "cursore" è il valore più recente già visto: alla sincronizzazione
 * successiva basta chiedere al server i documenti con `updatedAt > cursore`,
 * cioè solo quelli cambiati, invece di rileggere l'intero archivio.
 * Le eliminazioni sono salvate come "lapidi" (`deleted: true`) proprio perché
 * anche loro devono comparire tra i documenti cambiati.
 *
 * Questo file non dipende da Firebase, così la logica si può verificare a parte.
 */

/** Forma minima di un Timestamp Firestore. */
export type Stamp = { seconds: number; nanoseconds: number };

export type RawDoc = { id: string; data: Record<string, unknown> };

type Entry = { record: LedgerRecord | null };

/** Voce eliminata che conserva il contenuto: si può ripristinare dal cestino. */
export type TrashItem = { record: LedgerRecord; deletedAt: number | null };

export const CONFLICT_MESSAGE = "La voce è cambiata su un altro dispositivo. Chiudi la modifica e ricarica.";
export const EXISTS_MESSAGE = "Questa voce esiste già: probabilmente è stata registrata da un altro dispositivo. Ricarica la pagina.";

/** Cosa scrivere per una modifica: la voce salvata oppure una lapide con il contenuto per il cestino. */
export type WritePlan = { op: "save" } | { op: "tombstone"; value: Record<string, unknown> };

/**
 * Decide la scrittura di una modifica guardando il documento salvato sul server (null se non esiste).
 * Lancia un errore se un altro dispositivo ha cambiato la voce: la versione attesa non coincide.
 * Una voce nuova (versione null) non deve esistere già: così una scadenza ricorrente
 * registrata da due dispositivi non diventa due movimenti.
 */
export function planWrite(action: Mutation, stored: Record<string, unknown> | null): WritePlan {
  const tombstoned = !!stored && stored.deleted === true;
  // Una lapide vale come voce inesistente.
  const version = stored && !tombstoned && typeof stored.version === "string" ? stored.version : null;

  if (action.op === "save") {
    if (version !== action.record.version) throw new Error(action.record.version === null ? EXISTS_MESSAGE : CONFLICT_MESSAGE);
    return { op: "save" };
  }
  // Eliminare ciò che è già nel cestino: si svuota la lapide, senza controllo di versione.
  if (tombstoned) return { op: "tombstone", value: action.trash ?? {} };
  if (version !== action.version) throw new Error(CONFLICT_MESSAGE);
  const current = stored && typeof stored.value === "object" && stored.value !== null ? stored.value as Record<string, unknown> : {};
  return { op: "tombstone", value: action.trash ?? current };
}

function isStamp(value: unknown): value is Stamp {
  return typeof value === "object" && value !== null
    && typeof (value as Stamp).seconds === "number"
    && typeof (value as Stamp).nanoseconds === "number";
}

function isEmptyMap(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
}

export function compareStamps(a: Stamp, b: Stamp) {
  return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
}

export class LedgerMirror<T extends Stamp = Stamp> {
  private entries = new Map<string, Entry>();
  private trash = new Map<string, TrashItem>();
  /** Lapidi vuote (eliminazioni definitive) con l'ora dell'eliminazione: dopo un po' si cancellano davvero. */
  private emptied = new Map<string, number>();
  /** Documenti senza `updatedAt`, salvati da versioni precedenti dell'app. */
  readonly legacy = new Set<string>();
  cursor: T | null = null;

  get size() {
    return this.entries.size;
  }

  reset() {
    this.entries.clear();
    this.trash.clear();
    this.emptied.clear();
    this.legacy.clear();
    this.cursor = null;
  }

  apply(docs: RawDoc[]) {
    for (const { id, data } of docs) {
      const updatedAt = data.updatedAt;
      if (isStamp(updatedAt)) {
        this.legacy.delete(id);
        if (!this.cursor || compareStamps(updatedAt, this.cursor) > 0) this.cursor = updatedAt as T;
      } else {
        this.legacy.add(id);
      }

      if (data.deleted === true) {
        this.entries.set(id, { record: null });
        const deletedAt = isStamp(updatedAt) ? updatedAt.seconds * 1000 : null;
        const kept = recordSchema.safeParse({ kind: data.kind, id: data.id, version: data.version, value: data.value });
        if (kept.success) this.trash.set(id, { record: kept.data, deletedAt });
        else this.trash.delete(id);
        if (isEmptyMap(data.value) && deletedAt !== null) this.emptied.set(id, deletedAt);
        else this.emptied.delete(id);
        continue;
      }
      this.trash.delete(id);
      this.emptied.delete(id);
      // Un documento malformato non deve bloccare l'intero archivio.
      const parsed = recordSchema.safeParse(data);
      if (!parsed.success) console.warn("Voce ignorata perché non valida:", id);
      this.entries.set(id, { record: parsed.success ? parsed.data : null });
    }
  }

  /** ID delle lapidi vuote eliminate prima di `before` (millisecondi): si possono cancellare dal server. */
  staleTombstones(before: number): string[] {
    return [...this.emptied].filter(([, deletedAt]) => deletedAt < before).map(([id]) => id);
  }

  /** Dimentica documenti cancellati dal server. */
  forget(ids: string[]) {
    for (const id of ids) {
      this.entries.delete(id);
      this.trash.delete(id);
      this.emptied.delete(id);
      this.legacy.delete(id);
    }
  }

  trashed(): TrashItem[] {
    return [...this.trash.values()].sort((a, b) => (b.deletedAt ?? Infinity) - (a.deletedAt ?? Infinity));
  }

  records(): LedgerRecord[] {
    const records: LedgerRecord[] = [];
    for (const { record } of this.entries.values()) if (record) records.push(record);
    return records;
  }
}
