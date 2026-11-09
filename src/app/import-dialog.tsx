import { useMemo, useState, type ChangeEvent } from "react";
import { CircleAlert, FileUp, Landmark } from "lucide-react";
import { planImport, type ImportPlan } from "../lib/data-io";
import { deriveLedger, type LedgerRecord, type Mutation } from "../lib/ledger";
import { readStatementFile, type BankStatement } from "../lib/bank/statements";
import { BankImport } from "./bank-import";
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
  const [reading, setReading] = useState(false);
  const [statements, setStatements] = useState<BankStatement[] | null>(null);
  const ledger = useMemo(() => deriveLedger(records), [records]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    setPlan(null);
    setReadError("");
    setStatements(null);
    if (!files.length) return;
    if (files.some((file) => file.size > MAX_FILE_BYTES)) {
      setReadError("Il file è troppo grande (massimo 15 MB).");
      return;
    }
    setFileName(files.map((file) => file.name).join(", "));
    setReading(true);
    try {
      const results = await Promise.all(files.map((file) => readStatementFile(file)));
      const failed = results.find((result) => result.kind === "error");
      if (failed && failed.kind === "error") return setReadError(failed.message);
      const banks = results.flatMap((result) => (result.kind === "bank" ? [result.statement] : []));
      const apps = results.flatMap((result, index) => (result.kind === "app" ? [{ name: files[index].name, text: result.text }] : []));
      if (banks.length && apps.length) return setReadError("Importa gli estratti conto e i file dell’app separatamente.");
      if (apps.length > 1) return setReadError("Scegli un solo file dell’app alla volta.");
      if (apps.length) setPlan(planImport(apps[0].name, apps[0].text, records));
      else setStatements(banks);
    } catch {
      setReadError("Impossibile leggere il file.");
    } finally {
      setReading(false);
    }
  }

  if (statements) {
    return <BankImport ledger={ledger} statements={statements} busy={busy} error={error} progress={progress}
      onCommit={onCommit} onBack={() => { setStatements(null); setFileName(""); }} />;
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
    <div className="import-kinds">
      <div><Landmark size={18} /><p><strong>Estratti conto della banca</strong><span>Revolut (CSV), Fineco (PDF) o il CSV di un’altra banca. Puoi sceglierne più di uno insieme: i trasferimenti tra i tuoi conti vengono abbinati.</span></p></div>
      <div><FileUp size={18} /><p><strong>File di Expense Tracking</strong><span>Movimenti o saldi in CSV, oppure un backup completo (.json).</span></p></div>
    </div>
    <p className="form-help">Prima di importare vedrai l’anteprima di ogni riga; nulla viene cancellato. I file restano sul tuo dispositivo: vengono letti qui, nel browser.</p>
    <label className="file-picker">
      <FileUp size={19} />
      <span>{reading ? "Lettura in corso…" : fileName || "Scegli uno o più file…"}</span>
      <input type="file" multiple accept=".csv,.json,.pdf,text/csv,application/json,application/pdf" onChange={(event) => void choose(event)} disabled={busy || reading} />
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
