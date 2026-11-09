import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Ban, CircleAlert, HandCoins, Link2, Search, Sparkles, Wand2 } from "lucide-react";
import {
  activeLabels, money, newId, sameName, shortDate, subcategoryList,
  type Account, type Label, type Ledger, type Mutation,
} from "../lib/ledger";
import { buildCommit, classify, computeSplits, initialMapping, plannedBalances, type Proposal, type ProposalType } from "../lib/bank/classify";
import { parseGenericCsv, type BankStatement, type CsvMapping } from "../lib/bank/statements";
import { similarKeys } from "../lib/bank/text";
import { FormError } from "./ledger-forms";
import { cleanTag } from "./tags";

type Filter = "all" | "check" | "transfer" | "skip";
type Patch = Partial<Pick<Proposal, "type" | "labelId" | "subcategory" | "otherAccountId" | "debtId" | "tags" | "title" | "include" | "confidence" | "note" | "edited">>;

const CONFIDENCE: Record<Proposal["confidence"], [string, string]> = {
  rule: ["Regola", "conf-rule"],
  paired: ["Abbinato", "conf-paired"],
  auto: ["Riconosciuto", "conf-auto"],
  guess: ["Da controllare", "conf-guess"],
  skip: ["Escluso", "conf-skip"],
};

function count(value: number, one: string, many: string) {
  return `${value.toLocaleString("it-IT")} ${value === 1 ? one : many}`;
}

function monthTitle(month: string) {
  const name = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-15T12:00:00Z"));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function BankImport({ ledger, statements: initial, busy, error, progress, onCommit, onBack }: {
  ledger: Ledger; statements: BankStatement[]; busy: boolean; error: string; progress: string;
  onCommit: (actions: Mutation[], message: string) => void; onBack: () => void;
}) {
  const [statements, setStatements] = useState(initial);
  const [setup] = useState(() => initialMapping(initial, ledger));
  const [mapping, setMapping] = useState<Record<string, string>>(setup.mapping);
  const [drafts] = useState<Account[]>(setup.drafts);
  const [draftLabels, setDraftLabels] = useState<Label[]>([]);
  const [edits, setEdits] = useState<Record<string, Patch>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(80);
  const [learn, setLearn] = useState(true);
  const [writeBalances, setWriteBalances] = useState(true);
  const [creating, setCreating] = useState<{ id: string; type: "expense" | "income"; name: string } | null>(null);

  const cashAccount = ledger.accounts.find((account) => /^(contanti|cash)$/i.test(account.value.name.trim())) ?? drafts.find((account) => account.value.name === "Contanti")!;
  const view = useMemo<Ledger>(() => ({ ...ledger, accounts: [...ledger.accounts, ...drafts], labels: [...ledger.labels, ...draftLabels] }), [ledger, drafts, draftLabels]);
  const activeMapping = useMemo(() => Object.fromEntries(Object.entries(mapping).filter(([, accountId]) => accountId)), [mapping]);
  const base = useMemo(() => classify({ statements, mapping: activeMapping, ledger: view, cashAccountId: cashAccount.id }), [statements, activeMapping, view, cashAccount.id]);
  const proposals = useMemo(() => {
    const merged = base.map((item) => (edits[item.id] ? { ...item, ...edits[item.id] } : { ...item }));
    computeSplits(merged, view);
    return merged;
  }, [base, edits, view]);

  const accountName = (id: string) => view.accounts.find((account) => account.id === id)?.value.name ?? "";
  const ownAccounts = view.accounts.filter((account) => account.value.type !== "debt" && (!account.value.archived || Object.values(mapping).includes(account.id)));
  const debts = view.accounts.filter((account) => account.value.type === "debt" && !account.value.archived);
  const expenseLabels = activeLabels(view, "expense");
  const incomeLabels = activeLabels(view, "income");

  function patch(item: Proposal, change: Patch, spread = true) {
    setEdits((previous) => {
      const next = { ...previous, [item.id]: { ...previous[item.id], ...change, edited: true } };
      if (!spread) return next;
      // Stessa controparte nello stesso verso: stessa scelta (se non l'hai già cambiata a mano).
      const { include: _include, title: _title, ...shared } = change;
      if (!Object.keys(shared).length) return next;
      for (const other of proposals) {
        if (other.id === item.id || !similarKeys(other.key, item.key) || previous[other.id]?.edited) continue;
        if (other.incoming !== item.incoming && shared.type !== "skip") continue;
        if (other.confidence === "paired" || (other.type === "skip" && other.confidence === "skip")) continue;
        next[other.id] = { ...previous[other.id], ...shared, confidence: "auto", note: `Come «${item.title}».`, ...(shared.type && shared.type !== "skip" ? { include: true } : {}) };
      }
      return next;
    });
  }

  function setType(item: Proposal, type: ProposalType) {
    if (type === "skip") return patch(item, { type, include: false, confidence: "rule", note: "Ignorata da te." });
    const change: Patch = { type, include: true, confidence: "rule", note: "Scelta da te." };
    if (type === "expense" || type === "income") {
      const list = type === "expense" ? expenseLabels : incomeLabels;
      if (!list.some((label) => label.id === item.labelId)) change.labelId = list.find((label) => label.id === (type === "expense" ? "other-expenses" : "other-income"))?.id ?? list[0]?.id ?? "";
      if (type === "income") change.subcategory = "";
    }
    if (type === "repayment" && !item.debtId) change.debtId = debts[0]?.id ?? "";
    patch(item, change);
  }

  function chooseLabel(item: Proposal, value: string) {
    if (value === "__new__") {
      setCreating({ id: item.id, type: item.type === "income" ? "income" : "expense", name: "" });
      return;
    }
    patch(item, { labelId: value, subcategory: "", confidence: "rule", note: "Scelta da te." });
  }

  function createLabel(item: Proposal) {
    if (!creating) return;
    const name = creating.name.trim().slice(0, 100);
    if (!name) return setCreating(null);
    const existing = view.labels.find((label) => label.value.type === creating.type && sameName(label.value.name, name));
    const label: Label = existing ?? { kind: "label", id: newId(), version: null, value: { name, type: creating.type } };
    if (!existing) setDraftLabels((previous) => [...previous, label]);
    setCreating(null);
    patch(item, { labelId: label.id, subcategory: "", confidence: "rule", note: "Scelta da te." });
  }

  function updateCsv(statement: BankStatement, change: Partial<CsvMapping>) {
    if (!statement.csv) return;
    const next = parseGenericCsv(statement.file, statement.csv.rows, { ...statement.csv.mapping, ...change });
    setStatements((previous) => previous.map((item) => (item === statement ? next : item)));
    setEdits({});
  }

  // Riepilogo.
  const ready = proposals.filter((item) => item.include && item.type !== "skip" && !(item.type === "transfer" && !item.otherAccountId) && !(item.type === "repayment" && !item.debtId));
  const incomplete = proposals.filter((item) => item.include && ((item.type === "transfer" && !item.otherAccountId) || (item.type === "repayment" && !item.debtId)));
  const toCheck = proposals.filter((item) => item.confidence === "guess" && (item.type !== "skip" || item.note.startsWith("Forse")));
  const skipped = proposals.filter((item) => !item.include || item.type === "skip");
  const transfers = proposals.filter((item) => item.type === "transfer" || item.confidence === "paired");
  const reductions = proposals.filter((item) => item.include && item.reduces);
  const balanceCount = useMemo(() => plannedBalances(statements, activeMapping, view).length, [statements, activeMapping, view]);

  const needle = query.trim().toLocaleLowerCase("it");
  const visible = proposals
    .filter((item) => filter === "all" || (filter === "check" ? toCheck.includes(item) || incomplete.includes(item) : filter === "transfer" ? transfers.includes(item) : skipped.includes(item)))
    .filter((item) => !needle || `${item.title} ${item.text} ${accountName(item.accountId)}`.toLocaleLowerCase("it").includes(needle))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const shown = visible.slice(0, limit);
  const groups = new Map<string, Proposal[]>();
  for (const item of shown) groups.set(item.date.slice(0, 7), [...(groups.get(item.date.slice(0, 7)) ?? []), item]);

  function commit() {
    const used = new Set(Object.values(activeMapping));
    const plan = buildCommit({
      proposals, statements, mapping: activeMapping, ledger, draftAccounts: drafts.filter((account) => used.has(account.id) || proposals.some((item) => item.include && item.otherAccountId === account.id)),
      draftLabels, learn, balances: writeBalances,
    });
    const parts = [count(plan.movements, "movimento importato", "movimenti importati")];
    if (plan.balances) parts.push(count(plan.balances, "saldo aggiornato", "saldi aggiornati"));
    if (plan.rules) parts.push(count(plan.rules, "regola ricordata", "regole ricordate"));
    onCommit(plan.mutations, parts.join(", ") + ".");
  }

  const typeOptions = (item: Proposal): [ProposalType, string][] => item.incoming
    ? [["income", "Entrata"], ["transfer", "Trasferimento"], ["skip", "Ignora"]]
    : [["expense", "Spesa"], ["transfer", "Trasferimento"], ...(debts.length ? [["repayment", "Rata"] as [ProposalType, string]] : []), ["skip", "Ignora"]];

  return <div className="editor bank-import">
    {statements.map((statement) => <section className="bank-source" key={statement.file}>
      <div className="bank-source-head"><strong>{statement.file}</strong>
        <span>{statement.format === "revolut" ? "Revolut · CSV" : statement.format === "fineco-pdf" ? "Fineco · PDF" : "CSV di una banca"}</span></div>
      {statement.warnings.map((warning) => <p className="form-error" key={warning}>{warning}</p>)}
      {statement.csv && <div className="csv-mapping">
        {([["date", "Data"], ["amount", "Importo (+/−)"], ["debit", "Uscite"], ["credit", "Entrate"], ["balance", "Saldo"]] as [keyof CsvMapping, string][]).map(([key, title]) => <label key={key}>{title}
          <select value={statement.csv!.mapping[key] as number} onChange={(event) => updateCsv(statement, { [key]: Number(event.target.value) })}>
            <option value={-1}>—</option>
            {statement.csv!.columns.map((column, index) => <option key={index} value={index}>{column}</option>)}
          </select></label>)}
        <label>Descrizione
          <select value={statement.csv.mapping.description[0] ?? -1} onChange={(event) => updateCsv(statement, { description: Number(event.target.value) >= 0 ? [Number(event.target.value)] : [] })}>
            <option value={-1}>—</option>
            {statement.csv.columns.map((column, index) => <option key={index} value={index}>{column}</option>)}
          </select></label>
      </div>}
      <ul className="bank-products">{statement.products.map((product) => {
        const rows = product.rows.filter((row) => !row.skip);
        const dates = rows.map((row) => row.date).sort();
        return <li key={product.key}>
          <div><strong>{product.label}</strong>
            <small>{count(rows.length, "movimento", "movimenti")}{dates.length ? ` · dal ${shortDate(dates[0])} al ${shortDate(dates[dates.length - 1])}` : ""}{product.finalBalance !== null ? ` · saldo finale ${money(product.finalBalance)}` : ""}{product.cards.length ? ` · carta *${product.cards.join(", *")}` : ""}</small></div>
          <label className="bank-account">Nel conto
            <select value={mapping[product.key] ?? ""} onChange={(event) => { setMapping((previous) => ({ ...previous, [product.key]: event.target.value })); }}>
              {ownAccounts.filter((account) => !drafts.includes(account) || account.id === setup.mapping[product.key]).map((account) => <option key={account.id} value={account.id}>
                {account.value.name}{drafts.includes(account) ? " (nuovo conto)" : ""}{account.value.bank?.keys.includes(product.key) ? " (collegato)" : ""}</option>)}
              <option value="">Non importare</option>
            </select></label>
        </li>;
      })}</ul>
    </section>)}

    <div className="import-chips" role="status">
      <span className="chip-ok"><Sparkles size={14} /> {count(ready.length, "movimento da importare", "movimenti da importare")}</span>
      {transfers.length > 0 && <span><ArrowLeftRight size={14} /> {count(transfers.filter((item) => item.confidence === "paired").length, "trasferimento abbinato", "trasferimenti abbinati")}</span>}
      {toCheck.length > 0 && <span className="chip-warn"><CircleAlert size={14} /> {count(toCheck.length, "da controllare", "da controllare")}</span>}
      {incomplete.length > 0 && <span className="chip-warn">{count(incomplete.length, "senza conto o debito", "senza conto o debito")}</span>}
      <span><Ban size={14} /> {count(skipped.length, "esclusa", "escluse")}</span>
      {reductions.length > 0 && <span>{count(reductions.length, "rimborso su spese già registrate", "rimborsi su spese già registrate")}</span>}
      {balanceCount > 0 && <span><Link2 size={14} /> {count(balanceCount, "saldo di fine mese da aggiornare", "saldi di fine mese da aggiornare")}</span>}
    </div>

    <div className="import-toolbar">
      <div className="segmented small-text" role="group" aria-label="Filtra le righe">
        {([["all", `Tutte (${proposals.length})`], ["check", `Da controllare (${toCheck.length + incomplete.length})`], ["transfer", `Trasferimenti (${transfers.length})`], ["skip", `Escluse (${skipped.length})`]] as [Filter, string][])
          .map(([key, title]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => { setFilter(key); setLimit(80); }}>{title}</button>)}
      </div>
      <label className="search-field import-search"><Search size={16} /><input type="search" placeholder="Cerca" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Cerca nelle righe" /></label>
    </div>
    <p className="field-note"><Wand2 size={13} /> Quando cambi una riga, la stessa scelta vale per tutte le righe con la stessa controparte e viene ricordata per le prossime importazioni.</p>

    <div className="proposal-list">
      {[...groups.entries()].map(([month, items]) => <section key={month}>
        <h3 className="proposal-month">{monthTitle(month)}</h3>
        <ul>{items.map((item) => {
          const [badge, tone] = CONFIDENCE[item.confidence];
          const isNew = creating?.id === item.id;
          const subcategories = item.type === "expense" && item.labelId ? subcategoryList(view, item.labelId) : [];
          if (item.subcategory && !subcategories.some((name) => sameName(name, item.subcategory))) subcategories.push(item.subcategory);
          const missing = (item.type === "transfer" && !item.otherAccountId) || (item.type === "repayment" && !item.debtId);
          return <li key={item.id} className={`proposal ${item.include && item.type !== "skip" ? "" : "is-off"} ${missing && item.include ? "is-missing" : ""}`}>
            <input type="checkbox" className="proposal-check" checked={item.include && item.type !== "skip" || (item.include && !!item.reduces)} aria-label={`Importa ${item.title}`}
              disabled={item.type === "skip" && !item.reduces}
              onChange={(event) => patch(item, { include: event.target.checked }, false)} />
            <div className="proposal-main">
              <div className="proposal-top">
                <span className="proposal-date">{shortDate(item.date).slice(0, 5)}</span>
                <input className="proposal-title" value={item.title} maxLength={160} aria-label="Descrizione"
                  onChange={(event) => patch(item, { title: event.target.value }, false)} />
                <span className={`proposal-amount ${item.incoming ? "in" : "out"}`}>{item.incoming ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}{money(item.amount)}</span>
              </div>
              <div className="proposal-controls">
                <select value={item.type} aria-label="Tipo" onChange={(event) => setType(item, event.target.value as ProposalType)} disabled={item.confidence === "paired" && item.type === "skip"}>
                  {item.type === "skip" && !typeOptions(item).some(([key]) => key === "skip") && <option value="skip">Esclusa</option>}
                  {typeOptions(item).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
                </select>
                {(item.type === "expense" || item.type === "income") && !isNew && <select value={item.labelId} aria-label={item.type === "income" ? "Fonte" : "Categoria"} onChange={(event) => chooseLabel(item, event.target.value)}>
                  {(item.type === "income" ? incomeLabels : expenseLabels).map((label) => <option key={label.id} value={label.id}>{label.value.name}</option>)}
                  <option value="__new__">+ Nuova {item.type === "income" ? "fonte" : "categoria"}…</option>
                </select>}
                {isNew && <span className="inline-new">
                  <input autoFocus value={creating!.name} placeholder={creating!.type === "income" ? "Nome della fonte" : "Nome della categoria"} maxLength={100}
                    onChange={(event) => setCreating({ ...creating!, name: event.target.value })}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createLabel(item); } if (event.key === "Escape") setCreating(null); }} />
                  <button type="button" className="button secondary small" onClick={() => createLabel(item)}>Crea</button>
                </span>}
                {item.type === "expense" && !isNew && <select value={item.subcategory} aria-label="Sottocategoria" onChange={(event) => patch(item, { subcategory: event.target.value, confidence: "rule", note: "Scelta da te." })}>
                  <option value="">Nessuna sottocategoria</option>
                  {subcategories.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>}
                {item.type === "transfer" && <select value={item.otherAccountId} aria-label={item.incoming ? "Dal conto" : "Verso il conto"} onChange={(event) => patch(item, { otherAccountId: event.target.value, confidence: "rule", note: "Scelta da te." })}>
                  <option value="">{item.incoming ? "Da quale conto?" : "Verso quale conto?"}</option>
                  {ownAccounts.filter((account) => account.id !== item.accountId).map((account) => <option key={account.id} value={account.id}>
                    {item.incoming ? "Da " : "Verso "}{account.value.name}{account.value.type === "receivable" ? " (credito)" : ""}{drafts.includes(account) ? " (nuovo)" : ""}</option>)}
                </select>}
                {item.type === "repayment" && <select value={item.debtId} aria-label="Debito" onChange={(event) => patch(item, { debtId: event.target.value, confidence: "rule", note: "Scelta da te." })}>
                  <option value="">Quale debito?</option>
                  {debts.map((debt) => <option key={debt.id} value={debt.id}>{debt.value.name}</option>)}
                </select>}
                {item.type !== "skip" && <input className="proposal-tags" defaultValue={item.tags.join(", ")} key={item.tags.join(",")} placeholder="tag" aria-label="Tag (separati da virgola)"
                  onBlur={(event) => {
                    const tags = [...new Set(event.target.value.split(",").map(cleanTag).filter(Boolean))].slice(0, 10);
                    if (tags.join(",") !== item.tags.join(",")) patch(item, { tags });
                  }} />}
              </div>
              <div className="proposal-foot">
                <span className={`conf ${tone}`}>{badge}</span>
                <span className="proposal-account">{accountName(item.accountId)}</span>
                {item.note && <span className="proposal-note">{item.note}</span>}
                {item.type === "repayment" && item.principal !== undefined && <span className="proposal-note"><HandCoins size={12} /> {money(item.principal)} capitale · {money(item.interest ?? 0)} interessi</span>}
                {item.text && item.text !== item.title && <span className="proposal-raw" title={item.text}>{item.text}</span>}
              </div>
            </div>
          </li>;
        })}</ul>
      </section>)}
      {!visible.length && <p className="form-help">Nessuna riga con questo filtro.</p>}
      {visible.length > limit && <button type="button" className="button secondary" onClick={() => setLimit((value) => value + 120)}>Mostra altre {Math.min(120, visible.length - limit)} righe</button>}
    </div>

    <div className="import-options">
      <label className="check-row"><input type="checkbox" checked={learn} onChange={(event) => setLearn(event.target.checked)} />
        <span><strong>Ricorda le mie scelte</strong><small>Le righe che cambi diventano regole per le prossime importazioni (le trovi in Impostazioni).</small></span></label>
      <label className="check-row"><input type="checkbox" checked={writeBalances} onChange={(event) => setWriteBalances(event.target.checked)} />
        <span><strong>Aggiorna i saldi di fine mese dal file</strong><small>Usa il saldo indicato dalla banca: i conti tornano senza registrarli a mano.</small></span></label>
    </div>
    {progress && <p className="form-help" role="status">{progress}</p>}
    <FormError message={error} />
    <div className="modal-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onBack}>Indietro</button>
      <button type="button" className="button primary" disabled={busy || (!ready.length && !reductions.length && !(writeBalances && balanceCount))} onClick={commit}>
        {busy ? "Importazione…" : `Importa ${count(ready.length, "movimento", "movimenti")}`}
      </button>
    </div>
  </div>;
}
