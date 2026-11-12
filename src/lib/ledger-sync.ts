import { recordSchema, type LedgerRecord } from "./ledger";

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

function isStamp(value: unknown): value is Stamp {
  return typeof value === "object" && value !== null
    && typeof (value as Stamp).seconds === "number"
    && typeof (value as Stamp).nanoseconds === "number";
}

export function compareStamps(a: Stamp, b: Stamp) {
  return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
}

export class LedgerMirror<T extends Stamp = Stamp> {
  private entries = new Map<string, Entry>();
  /** Documenti senza `updatedAt`, salvati da versioni precedenti dell'app. */
  readonly legacy = new Set<string>();
  cursor: T | null = null;

  get size() {
    return this.entries.size;
  }

  reset() {
    this.entries.clear();
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
        continue;
      }
      // Un documento malformato non deve bloccare l'intero archivio.
      const parsed = recordSchema.safeParse(data);
      if (!parsed.success) console.warn("Voce ignorata perché non valida:", id);
      this.entries.set(id, { record: parsed.success ? parsed.data : null });
    }
  }

  records(): LedgerRecord[] {
    const records: LedgerRecord[] = [];
    for (const { record } of this.entries.values()) if (record) records.push(record);
    return records;
  }
}
