import { useMemo, useState, type FormEvent } from "react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Plus, Trash2, Undo2 } from "lucide-react";
import {
  ACCOUNT_TYPES, MAX_SUBCATEGORIES, accountBalances, activeAccounts, activeLabels, balanceId, isDefaultId, money,
  monthLabel, sameName, subcategoryList, subcategoryUsage, usage,
  type Account, type Label, type Ledger, type Movement, type Mutation,
} from "../lib/ledger";
import { FormError, Submit, field } from "./ledger-forms";

// ------------------------------------------------------------------ Conti

export function AccountEditor({ ledger, id, initial, busy, error, onCommit, onArchive, onRemove }: {
  ledger: Ledger; id: string; initial?: Account; busy: boolean; error: string;
  onCommit: (actions: Mutation[], message: string) => void;
  onArchive: (account: Account) => void; onRemove: (account: Account) => void;
}) {
  const [validation, setValidation] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = field(data, "name");
    const type = field(data, "type") as Account["value"]["type"];
    if (ledger.accounts.some((account) => account.id !== id && sameName(account.value.name, name))) {
      setValidation("Esiste già un conto con questo nome.");
      return;
    }
    setValidation("");
    const record: Account = { kind: "account", id, version: initial?.version ?? null, value: { ...initial?.value, name, type } };
    onCommit([{ op: "save", record }], initial ? "Conto aggiornato." : "Conto creato.");
  }

  return <form className="editor" onSubmit={submit}>
    <label>Nome<input name="name" defaultValue={initial?.value.name ?? ""} placeholder="Es. Contanti" maxLength={100} required /></label>
    <label>Tipo di conto
      <select name="type" defaultValue={initial?.value.type ?? "cash"}>
        {Object.entries(ACCOUNT_TYPES).map(([value, title]) => <option value={value} key={value}>{title}</option>)}
      </select>
      {initial && <span className="field-note">Il tipo decide come il saldo entra nel patrimonio: i debiti vengono sottratti.</span>}
    </label>
    {initial?.value.archived && <p className="form-help archived-note"><Archive size={15} /> Conto archiviato: non compare nei menu, ma lo storico resta.</p>}
    <FormError message={validation || error} />
    <div className="modal-actions">
      {initial && <div className="manage-actions">
        <button type="button" className="button danger-quiet" disabled={busy} onClick={() => onRemove(initial)}><Trash2 size={16} /> Elimina</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => onArchive(initial)}>
          {initial.value.archived ? <><ArchiveRestore size={16} /> Ripristina</> : <><Archive size={16} /> Archivia</>}
        </button>
      </div>}
      <Submit busy={busy} />
    </div>
  </form>;
}

// ------------------------------------------------------------------ Categorie e sottocategorie

type Row = { key: string; original: string | null; name: string; removed: boolean; moveTo: string; used: number };

let rowKey = 0;

function SubcategoryEditor({ rows, setRows, busy }: { rows: Row[]; setRows: (rows: Row[]) => void; busy: boolean }) {
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const visible = rows.filter((row) => !row.removed);

  function update(key: string, patch: Partial<Row>) {
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function move(key: string, direction: -1 | 1) {
    const index = rows.findIndex((row) => row.key === key);
    let target = index + direction;
    while (rows[target]?.removed) target += direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }

  function add() {
    const name = draft.trim().slice(0, 80);
    if (!name) return;
    if (visible.some((row) => sameName(row.name, name))) {
      setNote(`«${name}» è già nell’elenco.`);
      return;
    }
    if (visible.length >= MAX_SUBCATEGORIES) {
      setNote(`Puoi avere al massimo ${MAX_SUBCATEGORIES} sottocategorie per categoria.`);
      return;
    }
    setRows([...rows, { key: `n${rowKey++}`, original: null, name, removed: false, moveTo: "", used: 0 }]);
    setDraft("");
    setNote("");
  }

  return <fieldset className="subcategory-editor">
    <legend>Sottocategorie <span className="optional">{visible.length}</span></legend>
    {rows.length === 0 && <p className="form-help">Nessuna sottocategoria: aggiungine una qui sotto.</p>}
    <ul>
      {rows.map((row, index) => row.removed
        ? (row.used > 0 && <li key={row.key} className="sub-removed">
          <span><s>{row.original}</s> · {row.used} {row.used === 1 ? "movimento" : "movimenti"} passano a</span>
          <select value={row.moveTo} onChange={(event) => update(row.key, { moveTo: event.target.value })} disabled={busy}>
            <option value="">Nessuna sottocategoria</option>
            {visible.map((other) => <option key={other.key} value={other.name}>{other.name}</option>)}
          </select>
          <button type="button" className="icon-button quiet" aria-label={`Annulla eliminazione di ${row.original}`} onClick={() => update(row.key, { removed: false })}><Undo2 size={15} /></button>
        </li>)
        : <li key={row.key}>
          <input aria-label={`Nome sottocategoria ${index + 1}`} value={row.name} maxLength={80} disabled={busy}
            onChange={(event) => update(row.key, { name: event.target.value })} />
          {row.used > 0 && <span className="sub-count" title="Movimenti collegati">{row.used}</span>}
          <button type="button" className="icon-button quiet" aria-label={`Sposta su ${row.name}`} onClick={() => move(row.key, -1)} disabled={busy}><ArrowUp size={15} /></button>
          <button type="button" className="icon-button quiet" aria-label={`Sposta giù ${row.name}`} onClick={() => move(row.key, 1)} disabled={busy}><ArrowDown size={15} /></button>
          <button type="button" className="icon-button quiet danger-icon" aria-label={`Elimina ${row.name}`} disabled={busy}
            onClick={() => (row.original === null ? setRows(rows.filter((item) => item.key !== row.key)) : update(row.key, { removed: true }))}><Trash2 size={15} /></button>
        </li>)}
    </ul>
    <div className="sub-add">
      <input value={draft} placeholder="Nuova sottocategoria" maxLength={80} disabled={busy}
        onChange={(event) => { setDraft(event.target.value); setNote(""); }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
      <button type="button" className="button secondary" onClick={add} disabled={busy || !draft.trim()}><Plus size={16} /> Aggiungi</button>
    </div>
    {note && <p className="field-note" role="status">{note}</p>}
  </fieldset>;
}

export function LabelEditor({ ledger, id, labelType, initial, busy, error, onCommit, onArchive, onRemove }: {
  ledger: Ledger; id: string; labelType: "expense" | "income"; initial?: Label; busy: boolean; error: string;
  onCommit: (actions: Mutation[], message: string) => void;
  onArchive: (label: Label) => void; onRemove: (label: Label) => void;
}) {
  const expense = labelType === "expense";
  const initialRows = useMemo<Row[]>(() => (expense
    ? subcategoryList(ledger, id).map((name) => ({ key: `o${rowKey++}`, original: name, name, removed: false, moveTo: "", used: subcategoryUsage(ledger, id, name).length }))
    : []), [ledger, id, expense]);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [validation, setValidation] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = field(new FormData(event.currentTarget), "name");
    if (ledger.labels.some((label) => label.id !== id && label.value.type === labelType && sameName(label.value.name, name))) {
      setValidation(`Esiste già ${expense ? "una categoria" : "una fonte"} con questo nome.`);
      return;
    }
    const kept = rows.filter((row) => !row.removed).map((row) => ({ ...row, name: row.name.trim() }));
    if (kept.some((row) => !row.name)) {
      setValidation("Le sottocategorie non possono avere il nome vuoto.");
      return;
    }
    if (kept.some((row, index) => kept.findIndex((other) => sameName(other.name, row.name)) !== index)) {
      setValidation("Ci sono due sottocategorie con lo stesso nome.");
      return;
    }
    setValidation("");

    const actions: Mutation[] = [];
    const value: Label["value"] = { ...initial?.value, name, type: labelType };
    if (expense) value.subcategories = kept.map((row) => row.name);
    actions.push({ op: "save", record: { kind: "label", id, version: initial?.version ?? null, value } });

    // Rinomine ed eliminazioni si applicano anche ai movimenti e ai ricorrenti già salvati.
    const renames = new Map<string, string>();
    for (const row of rows) {
      if (row.original === null) continue;
      const target = row.removed ? row.moveTo : row.name.trim();
      if (row.removed || target !== row.original) renames.set(row.original.toLocaleLowerCase("it"), target);
    }
    if (renames.size) {
      for (const movement of ledger.movements) {
        const v = movement.value;
        if (v.type !== "expense" || v.labelId !== id || !v.subcategory) continue;
        const target = renames.get(v.subcategory.trim().toLocaleLowerCase("it"));
        if (target !== undefined && target !== v.subcategory) actions.push({ op: "save", record: { ...movement, value: { ...v, subcategory: target } } });
      }
      for (const recurring of ledger.recurring) {
        const t = recurring.value.template;
        if (t.type !== "expense" || t.labelId !== id || !t.subcategory) continue;
        const target = renames.get(t.subcategory.trim().toLocaleLowerCase("it"));
        if (target !== undefined && target !== t.subcategory) actions.push({ op: "save", record: { ...recurring, value: { ...recurring.value, template: { ...t, subcategory: target } } } });
      }
    }
    const touched = actions.length - 1;
    onCommit(actions, touched ? `Categoria salvata · ${touched} ${touched === 1 ? "movimento aggiornato" : "movimenti aggiornati"}.` : initial ? "Voce salvata." : expense ? "Categoria creata." : "Fonte creata.");
  }

  return <form className="editor" onSubmit={submit}>
    <label>Nome<input name="name" defaultValue={initial?.value.name ?? ""} placeholder={expense ? "Es. Casa" : "Es. Lavoro"} maxLength={100} required /></label>
    {expense && <SubcategoryEditor rows={rows} setRows={setRows} busy={busy} />}
    {initial?.value.archived && <p className="form-help archived-note"><Archive size={15} /> Voce archiviata: non compare nei menu, ma lo storico resta.</p>}
    <FormError message={validation || error} />
    <div className="modal-actions">
      {initial && <div className="manage-actions">
        <button type="button" className="button danger-quiet" disabled={busy} onClick={() => onRemove(initial)}><Trash2 size={16} /> Elimina</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => onArchive(initial)}>
          {initial.value.archived ? <><ArchiveRestore size={16} /> Ripristina</> : <><Archive size={16} /> Archivia</>}
        </button>
      </div>}
      <Submit busy={busy} />
    </div>
  </form>;
}

// ------------------------------------------------------------------ Archiviazione ed eliminazione

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function swapAccount(value: Movement["value"], from: string, to: string): Movement["value"] {
  if (value.type === "transfer") {
    return { ...value, accountId: value.accountId === from ? to : value.accountId, toAccountId: value.toAccountId === from ? to : value.toAccountId };
  }
  return { ...value, accountId: value.accountId === from ? to : value.accountId };
}

/** Elimina davvero una voce personalizzata; per quelle predefinite salva un segno di rimozione. */
function removalAction(target: Account | Label): Mutation {
  if (isDefaultId(target.kind, target.id)) {
    const { archived: _archived, ...rest } = target.value;
    return { op: "save", record: { ...target, value: { ...rest, removed: true } } as Account | Label };
  }
  return { op: "delete", kind: target.kind, id: target.id, version: target.version ?? "00000000-0000-4000-8000-000000000000" };
}

export function ArchiveDialog({ ledger, target, month, busy, error, onCommit, onCancel }: {
  ledger: Ledger; target: Account | Label; month: string; busy: boolean; error: string;
  onCommit: (actions: Mutation[], message: string) => void; onCancel: () => void;
}) {
  const restoring = !!target.value.archived;
  const isAccount = target.kind === "account";
  const current = isAccount ? accountBalances(ledger, month).find((item) => item.account.id === target.id)?.amount ?? null : null;
  const [zero, setZero] = useState(current !== null && current !== 0);
  const name = target.value.name;

  function confirm() {
    const { archived: _ignored, ...rest } = target.value;
    const value = restoring ? rest : { ...target.value, archived: true };
    const actions: Mutation[] = [{ op: "save", record: { ...target, value } as Account | Label }];
    if (!restoring && isAccount && zero) {
      const id = balanceId(target.id, month);
      const existing = ledger.balances.find((balance) => balance.id === id);
      actions.push({ op: "save", record: { kind: "balance", id, version: existing?.version ?? null, value: { accountId: target.id, month, amount: 0 } } });
    }
    onCommit(actions, restoring ? `«${name}» ripristinato.` : `«${name}» archiviato.`);
  }

  return <div className="editor">
    <p className="form-help">{restoring
      ? `«${name}» tornerà disponibile nei menu.`
      : `«${name}» sparirà dai menu di scelta. I movimenti già registrati restano e continuano a contare nelle analisi.`}</p>
    {!restoring && isAccount && current !== null && current !== 0 && <label className="check-row">
      <input type="checkbox" checked={zero} onChange={(event) => setZero(event.target.checked)} />
      <span><strong>Registra un saldo di 0 € a {monthLabel(month)}</strong>
        <small>Il saldo attuale è {money(current)}: se il conto è chiuso, azzeralo così non resta nel patrimonio netto.</small></span>
    </label>}
    <FormError message={error} />
    <div className="modal-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Annulla</button>
      <button type="button" className="button primary" disabled={busy} onClick={confirm}>
        {busy ? "Salvataggio…" : restoring ? "Ripristina" : "Archivia"}
      </button>
    </div>
  </div>;
}

export function RemoveDialog({ ledger, target, busy, error, onCommit, onCancel }: {
  ledger: Ledger; target: Account | Label; busy: boolean; error: string;
  onCommit: (actions: Mutation[], message: string) => void; onCancel: () => void;
}) {
  const isAccount = target.kind === "account";
  const used = usage(ledger, target.kind, target.id);
  const linked = used.movements.length + used.recurring.length;
  const alternatives = isAccount
    ? activeAccounts(ledger).filter((account) => account.id !== target.id && account.value.type !== "debt")
    : activeLabels(ledger, (target as Label).value.type).filter((label) => label.id !== target.id);
  const [choice, setChoice] = useState<"archive" | "move">(linked ? "archive" : "move");
  const [destination, setDestination] = useState(alternatives[0]?.id ?? "");
  const name = target.value.name;
  const noun = isAccount ? "il conto" : target.kind === "label" && (target as Label).value.type === "income" ? "la fonte" : "la categoria";

  // Un trasferimento tra il conto da eliminare e quello di destinazione diventerebbe da un conto a sé stesso.
  const conflicts = isAccount && destination
    ? used.movements.filter(({ value }) => value.type === "transfer" && [value.accountId, value.toAccountId].includes(destination)).length
    : 0;

  function confirm() {
    if (linked && choice === "archive") {
      onCommit([{ op: "save", record: { ...target, value: { ...target.value, archived: true } } as Account | Label }], `«${name}» archiviato.`);
      return;
    }
    const actions: Mutation[] = [];
    if (linked) {
      const destinationLabel = !isAccount ? ledger.labels.find((label) => label.id === destination) : undefined;
      const newSubcategories: string[] = [];
      for (const movement of used.movements) {
        const v = movement.value;
        let value = v;
        if (isAccount) {
          value = swapAccount(v, target.id, destination);
        } else if (v.type !== "transfer") {
          value = { ...v, labelId: destination };
          if (value.type === "expense" && value.subcategory && destinationLabel) newSubcategories.push(value.subcategory);
        }
        actions.push({ op: "save", record: { ...movement, value } });
      }
      for (const recurring of used.recurring) {
        const t = recurring.value.template;
        let template = t;
        if (isAccount) {
          template = swapAccount(t, target.id, destination);
        } else if (t.type !== "transfer") {
          template = { ...t, labelId: destination };
        }
        actions.push({ op: "save", record: { ...recurring, value: { ...recurring.value, template } } });
      }
      // Le sottocategorie dei movimenti spostati entrano nell'elenco della categoria di destinazione.
      if (destinationLabel && destinationLabel.value.type === "expense" && newSubcategories.length) {
        const list = subcategoryList(ledger, destinationLabel.id);
        for (const item of newSubcategories) if (!list.some((existing) => sameName(existing, item)) && list.length < MAX_SUBCATEGORIES) list.push(item);
        actions.push({ op: "save", record: { ...destinationLabel, value: { ...destinationLabel.value, subcategories: list } } });
      }
    }
    for (const balance of used.balances) actions.push({ op: "delete", kind: "balance", id: balance.id, version: balance.version ?? "00000000-0000-4000-8000-000000000000" });
    actions.push(removalAction(target));
    onCommit(actions, linked ? `${plural(linked, "voce spostata", "voci spostate")} e «${name}» eliminato.` : `«${name}» eliminato.`);
  }

  const blocked = choice === "move" && linked > 0 && (!destination || conflicts > 0);

  return <div className="editor">
    {linked === 0 ? <p className="form-help">
      Eliminare {noun} «{name}»?{used.balances.length > 0 && ` Verranno eliminati anche ${plural(used.balances.length, "saldo registrato", "saldi registrati")}.`}
    </p> : <>
      <p className="form-help">
        «{name}» è usato da {plural(used.movements.length, "movimento", "movimenti")}{used.recurring.length > 0 && ` e ${plural(used.recurring.length, "ricorrente", "ricorrenti")}`}. Scegli cosa fare:
      </p>
      <div className="choice-list" role="radiogroup">
        <label className="check-row">
          <input type="radio" name="remove-choice" checked={choice === "archive"} onChange={() => setChoice("archive")} />
          <span><strong>Archivia <span className="optional">consigliato</span></strong>
            <small>Sparisce dai menu, i movimenti restano com’erano.</small></span>
        </label>
        <label className="check-row">
          <input type="radio" name="remove-choice" checked={choice === "move"} onChange={() => setChoice("move")} disabled={!alternatives.length} />
          <span><strong>Sposta i movimenti ed elimina</strong>
            <small>{alternatives.length ? "Tutti i movimenti collegati passano alla voce scelta." : `Non c’è ${isAccount ? "un altro conto" : "un’altra voce"} su cui spostarli.`}</small></span>
        </label>
        {choice === "move" && alternatives.length > 0 && <label className="indent">Sposta su
          <select value={destination} onChange={(event) => setDestination(event.target.value)}>
            {alternatives.map((item) => <option key={item.id} value={item.id}>{item.value.name}</option>)}
          </select>
          {used.balances.length > 0 && <span className="field-note">I {plural(used.balances.length, "saldo registrato", "saldi registrati")} di «{name}» verranno eliminati.</span>}
        </label>}
      </div>
      {conflicts > 0 && choice === "move" && <FormError message={`Ci sono ${plural(conflicts, "trasferimento", "trasferimenti")} tra «${name}» e il conto scelto: diventerebbero da un conto a sé stesso. Modificali o eliminali prima, oppure scegli un altro conto.`} />}
    </>}
    <FormError message={error} />
    <div className="modal-actions">
      <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Annulla</button>
      <button type="button" className={choice === "archive" && linked ? "button primary" : "button danger"} disabled={busy || blocked} onClick={confirm}>
        {busy ? "Salvataggio…" : linked && choice === "archive" ? "Archivia" : "Elimina"}
      </button>
    </div>
  </div>;
}
