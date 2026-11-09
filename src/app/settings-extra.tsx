import { useState, type FormEvent, type ReactNode } from "react";
import { FileClock, ListChecks, Pencil, Plus, Tag, Trash2, Undo2 } from "lucide-react";
import {
  RULE_TYPES, activeLabels, allTags, hasTag, sameName, shortDate, subcategoryList,
  type Ledger, type Mutation, type Rule, type ImportBatch,
} from "../lib/ledger";
import { ruleId, undoImport } from "../lib/bank/classify";
import { merchantKey } from "../lib/bank/text";
import { FormError, Submit, field } from "./ledger-forms";
import { cleanTag, TagInput } from "./tags";

function PanelHead({ icon, title, subtitle, action }: { icon: ReactNode; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="panel-heading">
    <div><h2 className="heading-with-icon">{icon} {title}</h2><p>{subtitle}</p></div>
    {action}
  </div>;
}

const RULE_TITLES: Record<(typeof RULE_TYPES)[number], string> = { expense: "Spesa", income: "Entrata", transfer: "Trasferimento", repayment: "Rata", ignore: "Ignora" };

export function describeRule(ledger: Ledger, rule: Rule) {
  const value = rule.value;
  const name = (id?: string) => (id ? ledger.accounts.find((account) => account.id === id)?.value.name ?? "conto eliminato" : "?");
  const label = (id?: string) => (id ? ledger.labels.find((item) => item.id === id)?.value.name ?? "categoria eliminata" : "");
  if (value.type === "ignore") return "Ignora la riga";
  if (value.type === "transfer") return `Trasferimento con ${name(value.accountId)}`;
  if (value.type === "repayment") return `Rata di ${name(value.debtId)}`;
  return `${RULE_TITLES[value.type]} · ${label(value.labelId)}${value.subcategory ? ` / ${value.subcategory}` : ""}`;
}

// ------------------------------------------------------------------ Regole

export function RulesPanel({ ledger, onRule }: { ledger: Ledger; onRule: (rule?: Rule) => void }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase("it");
  const rules = [...ledger.rules]
    .filter((rule) => !needle || `${rule.value.match} ${rule.value.title ?? ""} ${describeRule(ledger, rule)}`.toLocaleLowerCase("it").includes(needle))
    .sort((a, b) => (a.value.mode === b.value.mode ? a.value.match.localeCompare(b.value.match, "it") : a.value.mode === "contains" ? -1 : 1));
  return <section className="panel settings-extra">
    <PanelHead icon={<ListChecks size={18} />} title="Regole d’importazione" subtitle="Come vengono classificate le righe degli estratti conto. Si creano da sole quando correggi l’anteprima."
      action={<button type="button" className="button secondary" onClick={() => onRule()}><Plus size={17} /> Nuova regola</button>} />
    {ledger.rules.length > 8 && <label className="search-field rules-search"><input type="search" placeholder="Cerca una regola" value={query} onChange={(event) => setQuery(event.target.value)} /></label>}
    {ledger.rules.length ? <ul className="rule-list">{rules.slice(0, 200).map((rule) => <li key={rule.id}>
      <div>
        <strong>{rule.value.mode === "contains" ? `Contiene «${rule.value.match}»` : `«${rule.value.match}»`}</strong>
        <small>{describeRule(ledger, rule)}{rule.value.title ? ` · rinomina in «${rule.value.title}»` : ""}{rule.value.tags?.length ? ` · #${rule.value.tags.join(" #")}` : ""}{rule.value.learned ? " · imparata" : ""}</small>
      </div>
      <button type="button" className="icon-button quiet" aria-label={`Modifica la regola ${rule.value.match}`} onClick={() => onRule(rule)}><Pencil size={15} /></button>
    </li>)}</ul> : <p className="panel-note">Nessuna regola per ora. Importa un estratto conto: le scelte che fai nell’anteprima diventano regole.</p>}
  </section>;
}

export function RuleEditor({ ledger, initial, busy, error, onCommit, onRemove }: {
  ledger: Ledger; initial?: Rule; busy: boolean; error: string;
  onCommit: (actions: Mutation[], message: string) => void; onRemove: (rule: Rule) => void;
}) {
  const value = initial?.value;
  const [type, setType] = useState<Rule["value"]["type"]>(value?.type ?? "expense");
  const [labelId, setLabelId] = useState(value?.labelId ?? "");
  const [tags, setTags] = useState<string[]>(value?.tags ?? []);
  const [validation, setValidation] = useState("");
  const accounts = ledger.accounts.filter((account) => account.value.type !== "debt" && !account.value.archived);
  const debts = ledger.accounts.filter((account) => account.value.type === "debt" && !account.value.archived);
  const labels = activeLabels(ledger, type === "income" ? "income" : "expense", value?.labelId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const mode = field(data, "mode") as "key" | "contains";
    const raw = field(data, "match");
    const match = mode === "key" ? merchantKey(raw) : raw.trim().toLocaleLowerCase("it");
    if (match.length < 2) return setValidation("Scrivi almeno due caratteri.");
    const next: Rule["value"] = { match: match.slice(0, 120), mode, type };
    if (type === "expense" || type === "income") {
      const chosen = field(data, "label") || labelId;
      if (!chosen) return setValidation("Scegli la categoria o la fonte.");
      next.labelId = chosen;
      if (type === "expense" && field(data, "subcategory")) next.subcategory = field(data, "subcategory");
    }
    if (type === "transfer") { next.accountId = field(data, "account"); if (!next.accountId) return setValidation("Scegli l’altro conto."); }
    if (type === "repayment") { next.debtId = field(data, "debt"); if (!next.debtId) return setValidation("Scegli il debito."); }
    if (field(data, "title")) next.title = field(data, "title").slice(0, 160);
    if (tags.length) next.tags = tags.map(cleanTag).filter(Boolean);
    const id = initial && initial.value.mode === mode && initial.value.match === next.match ? initial.id : ruleId(mode, next.match);
    const existing = ledger.rules.find((rule) => rule.id === id);
    const actions: Mutation[] = [{ op: "save", record: { kind: "rule", id, version: existing?.version ?? null, value: next } }];
    if (initial && initial.id !== id) actions.push({ op: "delete", kind: "rule", id: initial.id, version: initial.version ?? "00000000-0000-4000-8000-000000000000" });
    setValidation("");
    onCommit(actions, initial ? "Regola aggiornata." : "Regola creata.");
  }

  return <form className="editor" onSubmit={submit}>
    <div className="form-grid">
      <label>Se la descrizione
        <select name="mode" defaultValue={value?.mode ?? "contains"}>
          <option value="contains">contiene il testo</option>
          <option value="key">è la controparte</option>
        </select></label>
      <label>Testo<input name="match" defaultValue={value?.match ?? ""} placeholder="Es. canone affitto" maxLength={120} required /></label>
    </div>
    <label>Allora è
      <select value={type} onChange={(event) => { setType(event.target.value as Rule["value"]["type"]); setLabelId(""); }}>
        {RULE_TYPES.map((item) => <option key={item} value={item}>{RULE_TITLES[item]}</option>)}
      </select></label>
    {(type === "expense" || type === "income") && <div className="form-grid">
      <label>{type === "income" ? "Fonte" : "Categoria"}
        <select name="label" value={labelId} onChange={(event) => setLabelId(event.target.value)} required>
          <option value="">Scegli</option>
          {labels.map((label) => <option key={label.id} value={label.id}>{label.value.name}</option>)}
        </select></label>
      {type === "expense" && <label>Sottocategoria <span className="optional">facoltativa</span>
        <select name="subcategory" defaultValue={value?.subcategory ?? ""} disabled={!labelId}>
          <option value="">Nessuna</option>
          {labelId && subcategoryList(ledger, labelId).map((name) => <option key={name} value={name}>{name}</option>)}
        </select></label>}
    </div>}
    {type === "transfer" && <label>Con il conto
      <select name="account" defaultValue={value?.accountId ?? ""} required>
        <option value="">Scegli</option>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.value.name}</option>)}
      </select></label>}
    {type === "repayment" && <label>Debito
      <select name="debt" defaultValue={value?.debtId ?? ""} required>
        <option value="">Scegli</option>
        {debts.map((account) => <option key={account.id} value={account.id}>{account.value.name}</option>)}
      </select></label>}
    {type !== "ignore" && <>
      <label>Rinomina in <span className="optional">facoltativo</span><input name="title" defaultValue={value?.title ?? ""} maxLength={160} placeholder="Es. Affitto" /></label>
      <label>Tag <span className="optional">facoltativi</span><TagInput value={tags} onChange={setTags} suggestions={allTags(ledger).map((item) => item.name)} /></label>
    </>}
    <p className="field-note">Le regole «contiene» valgono prima di quelle imparate. Si applicano alle prossime importazioni, non ai movimenti già salvati.</p>
    <FormError message={validation || error} />
    <div className="modal-actions">
      {initial && <button type="button" className="button danger-quiet" disabled={busy} onClick={() => onRemove(initial)}><Trash2 size={16} /> Elimina</button>}
      <Submit busy={busy} />
    </div>
  </form>;
}

// ------------------------------------------------------------------ Importazioni

export function ImportsPanel({ ledger, onUndo }: { ledger: Ledger; onUndo: (batch: ImportBatch) => void }) {
  if (!ledger.imports.length) return null;
  return <section className="panel settings-extra">
    <PanelHead icon={<FileClock size={18} />} title="Importazioni" subtitle="Gli estratti conto importati. Puoi annullarne uno: spariscono i suoi movimenti e tornano i saldi di prima." />
    <ul className="rule-list">{ledger.imports.slice(0, 30).map((batch) => {
      const left = ledger.movements.filter(({ value }) => value.origin?.batch === batch.id).length;
      return <li key={batch.id}>
        <div><strong>{batch.value.file || "Estratto conto"}</strong>
          <small>{shortDate(batch.value.at)} · {left.toLocaleString("it-IT")} movimenti{batch.value.balances.length ? ` · ${batch.value.balances.length} saldi` : ""}{batch.value.updates.length ? ` · ${batch.value.updates.length} spese ridotte da rimborsi` : ""}</small></div>
        <button type="button" className="button secondary small" onClick={() => onUndo(batch)}><Undo2 size={14} /> Annulla</button>
      </li>;
    })}</ul>
  </section>;
}

export function UndoImportDialog({ ledger, batch, busy, error, onCommit, onCancel }: {
  ledger: Ledger; batch: ImportBatch; busy: boolean; error: string;
  onCommit: (actions: Mutation[], message: string) => void; onCancel: () => void;
}) {
  const actions = undoImport(ledger, batch.id);
  const movements = actions.filter((action) => action.op === "delete" && action.kind === "movement").length;
  const edited = ledger.movements.filter(({ value }) => value.origin?.batch === batch.id).length;
  return <div className="editor">
    <p className="form-help">Annullare l’importazione di «{batch.value.file}» del {shortDate(batch.value.at)}?</p>
    <ul className="plain-list">
      <li>{movements.toLocaleString("it-IT")} movimenti eliminati{edited !== movements ? "" : " (anche quelli che hai modificato dopo)"}</li>
      {batch.value.balances.length > 0 && <li>{batch.value.balances.length} saldi di fine mese riportati al valore di prima</li>}
      {batch.value.updates.length > 0 && <li>{batch.value.updates.length} spese riportate all’importo prima del rimborso</li>}
      {batch.value.accounts.length > 0 && <li>I conti creati dall’importazione vengono eliminati se non servono più</li>}
    </ul>
    <p className="field-note">Le regole imparate restano: le trovi in Impostazioni e puoi eliminarle.</p>
    <FormError message={error} />
    <div className="modal-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Annulla</button>
      <button type="button" className="button danger" disabled={busy} onClick={() => onCommit(actions, "Importazione annullata.")}>{busy ? "Annullamento…" : "Annulla l’importazione"}</button>
    </div>
  </div>;
}

// ------------------------------------------------------------------ Tag

export function TagsPanel({ ledger, onCommit, busy }: { ledger: Ledger; busy: boolean; onCommit: (actions: Mutation[], message: string) => void }) {
  const tags = allTags(ledger);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  if (!tags.length) return null;

  function rename(from: string, to: string | null) {
    const target = to === null ? null : cleanTag(to);
    if (target === "") return;
    const actions: Mutation[] = [];
    for (const movement of ledger.movements) {
      if (!hasTag(movement.value, from)) continue;
      const rest = (movement.value.tags ?? []).filter((tag) => !sameName(tag, from));
      const next = target && !rest.some((tag) => sameName(tag, target)) ? [...rest, target] : rest;
      const { tags: _old, ...value } = movement.value;
      actions.push({ op: "save", record: { ...movement, value: next.length ? { ...value, tags: next } : value } as typeof movement });
    }
    setEditing(null);
    onCommit(actions, target ? `Tag rinominato in «${target}».` : `Tag «${from}» tolto da ${actions.length} movimenti.`);
  }

  return <section className="panel settings-extra">
    <PanelHead icon={<Tag size={18} />} title="Tag" subtitle="Etichette libere che valgono tra categorie diverse (es. un viaggio, un evento)." />
    <ul className="rule-list">{tags.map((tag) => <li key={tag.name}>
      {editing === tag.name ? <form className="inline-new" onSubmit={(event) => { event.preventDefault(); rename(tag.name, text); }}>
        <input autoFocus value={text} maxLength={40} onChange={(event) => setText(event.target.value)} aria-label="Nuovo nome del tag" />
        <button type="submit" className="button secondary small" disabled={busy}>Rinomina</button>
        <button type="button" className="text-button" onClick={() => setEditing(null)}>Annulla</button>
      </form> : <>
        <div><strong>#{tag.name}</strong><small>{tag.count.toLocaleString("it-IT")} movimenti</small></div>
        <span className="archived-actions">
          <button type="button" className="text-button" onClick={() => { setEditing(tag.name); setText(tag.name); }}>Rinomina</button>
          <button type="button" className="text-button danger-text" disabled={busy} onClick={() => rename(tag.name, null)}>Togli</button>
        </span>
      </>}
    </li>)}</ul>
  </section>;
}
