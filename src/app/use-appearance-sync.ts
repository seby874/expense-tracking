// Aspetto sincronizzato tra i dispositivi: arriva con l'archivio e si salva da solo quando cambia
// (non con i dati di esempio). Il salvataggio legge sempre l'aspetto più recente; se non riesce resta
// in sospeso e si riprova, e intanto l'aspetto online non sovrascrive la modifica (vedi lib/theme-runtime.ts).
import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { LedgerRecord, Mutation } from "../lib/ledger";
import { CONFLICT_MESSAGE, EXISTS_MESSAGE, applyActions } from "../lib/ledger-sync";
import { writeLedger } from "../lib/local-ledger";
import { appearanceSaved, getAppearance, receiveAppearance, setAppearanceSync } from "../lib/theme-runtime";

interface SyncInput {
  status: "loading" | "ready" | "error";
  demo: boolean;
  currentRecords: LedgerRecord[];
  /** Blocco condiviso con gli altri salvataggi dell'app. */
  writing: MutableRefObject<boolean>;
  setRecords: Dispatch<SetStateAction<LedgerRecord[]>>;
  load: () => Promise<void>;
}

export function useAppearanceSync({ status, demo, currentRecords, writing, setRecords, load }: SyncInput) {
  const lookRecord = currentRecords.find((record) => record.kind === "setting" && record.id === "look") ?? null;
  const lookRef = useRef(lookRecord);
  lookRef.current = lookRecord;
  const lookRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (status !== "ready" || demo) { setAppearanceSync(null); return undefined; }
    let active = true;
    const later = (ms: number) => {
      if (lookRetry.current) clearTimeout(lookRetry.current);
      lookRetry.current = setTimeout(() => { lookRetry.current = null; void save(); }, ms);
    };
    async function save() {
      if (!active) return;
      if (writing.current) { later(1500); return; }
      const record = { kind: "setting", id: "look", version: lookRef.current?.version ?? null, value: getAppearance() } as LedgerRecord;
      const actions: Mutation[] = [{ op: "save", record }];
      writing.current = true;
      try {
        const saved = await writeLedger(actions);
        if (!active) return;
        setRecords((previous) => applyActions(previous, actions, saved));
        appearanceSaved();
      } catch (error) {
        if (!active) return;
        // Cambiato su un altro dispositivo: si rilegge la versione online e si risalva la modifica di qui.
        // Senza connessione si riprova più tardi.
        const conflict = error instanceof Error && (error.message === CONFLICT_MESSAGE || error.message === EXISTS_MESSAGE);
        writing.current = false;
        if (conflict) void load();
        later(conflict ? 2000 : 15_000);
      } finally {
        writing.current = false;
      }
    }
    // Prima il salvataggio, poi la lettura: così il ripristino e la prima pubblicazione vengono scritti davvero.
    setAppearanceSync(() => void save());
    receiveAppearance(lookRef.current?.value ?? null);
    return () => {
      active = false;
      if (lookRetry.current) clearTimeout(lookRetry.current);
      lookRetry.current = null;
      setAppearanceSync(null);
    };
  }, [status, demo]);
  useEffect(() => {
    if (status === "ready" && !demo) receiveAppearance(lookRef.current?.value ?? null);
  }, [lookRecord?.version]);

}
