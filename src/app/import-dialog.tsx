import { useState, type ChangeEvent } from "react";
import { CircleAlert, FileUp } from "lucide-react";
import { planImport, type ImportPlan } from "../lib/data-io";
import type { LedgerRecord, Mutation } from "../lib/ledger";
import { FormError } from "./ledger-forms";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function count(value: number, one: string, many: string) {
  return `${value.toLocaleString("it-IT")} ${value === 1 ? one : many}`;
}

export function ImportDialog({ records, busy, error, progress, onCommit, onCancel }: {
  records: LedgerRecord[]; busy: boolean; error: string; progress: string;
  onCommit: (actions: Mutation[], message: string) => void; onCancel: () => void;
}) {
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState("");

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPlan(null);
    setReadError("");
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setReadError("Il file è troppo grande (massimo 15 MB).");
      return;
    }
    setFileName(file.name);
    try {
      setPlan(planImport(file.name, await file.text(), records));
    } catch {
      setReadError("Impossibile leggere il file.");
    }
  }

  const writes = plan?.mutations.length ?? 0;
  const summary: string[] = [];
  if (plan?.kind === "csv-movements") {
    summary.push(count(plan.newMovements, "movimento nuovo", "movimenti nuovi"));
    if (plan.duplicates) summary.push(`${count(plan.duplicates, "movimento già presente", "movimenti già presenti")} (saltati)`);
  }
  if (plan?.kind === "csv-balances") {
    summary.push(count(plan.newBalances, "saldo nuovo", "saldi nuovi"));
    if (plan.updatedBalances) summary.push(`${count(plan.updatedBalances, "saldo", "saldi")} da aggiornare con il valore del file`);
    if (plan.sameBalances) summary.push(`${count(plan.sameBalances, "saldo già presente", "saldi già presenti")} (saltati)`);
  }
  if (plan?.kind === "backup") {
    summary.push(count(plan.restored, "voce da ripristinare", "voci da ripristinare"));
    if (plan.unchanged) summary.push(`${count(plan.unchanged, "voce identica", "voci identiche")} (saltate)`);
  }
  if (plan?.newAccounts.length) summary.push(`Conti nuovi: ${plan.newAccounts.join(", ")}`);
  if (plan?.newLabels.length) summary.push(`Categorie e fonti nuove: ${plan.newLabels.join(", ")}`);
  if (plan?.newSubcategories) summary.push(count(plan.newSubcategories, "sottocategoria nuova", "sottocategorie nuove"));

  const message = plan?.kind === "backup" ? "Backup ripristinato."
    : plan?.kind === "csv-balances" ? `${count(plan.newBalances + plan.updatedBalances, "saldo importato", "saldi importati")}.`
    : plan ? `${count(plan.newMovements, "movimento importato", "movimenti importati")}.` : "";

  return <div className="editor import-dialog">
    <p className="form-help">Scegli un file esportato da Expense Tracking: <strong>movimenti</strong> o <strong>saldi</strong> in CSV, oppure un <strong>backup completo</strong> (.json). Prima di importare vedrai cosa cambia; nulla viene cancellato.</p>
    <label className="file-picker">
      <FileUp size={19} />
      <span>{fileName || "Scegli il file…"}</span>
      <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => void choose(event)} disabled={busy} />
    </label>
    <FormError message={readError} />
    {plan && <div className="import-summary" role="status">
      {summary.length > 0 && <ul>{summary.map((line) => <li key={line}>{line}</li>)}</ul>}
      {plan.issues.length > 0 && <div className="import-issues">
        <strong><CircleAlert size={15} /> {count(plan.issues.length, "riga ignorata", "righe ignorate")}</strong>
        <ul>{plan.issues.slice(0, 6).map((issue) => <li key={`${issue.line}-${issue.reason}`}>{issue.line ? `Riga ${issue.line}: ` : ""}{issue.reason}</li>)}</ul>
        {plan.issues.length > 6 && <small>…e altre {plan.issues.length - 6}.</small>}
      </div>}
      {!writes && !plan.issues.length && <p className="form-help">Non c’è nulla di nuovo da importare.</p>}
    </div>}
    {progress && <p className="form-help" role="status">{progress}</p>}
    <FormError message={error} />
    <div className="modal-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Annulla</button>
      <button type="button" className="button primary" disabled={busy || !writes} onClick={() => plan && onCommit(plan.mutations, message)}>
        {busy ? "Importazione…" : writes ? `Importa (${writes.toLocaleString("it-IT")} ${writes === 1 ? "scrittura" : "scritture"})` : "Importa"}
      </button>
    </div>
  </div>;
}
