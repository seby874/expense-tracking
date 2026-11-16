import { SlidersHorizontal } from "lucide-react";
import { parseMoney, type Ledger, type MovementExtra } from "../lib/ledger";
import { moduleOn, deductionInfo } from "../lib/params";
import { personName } from "../lib/people";
import { deductionKey } from "../lib/tax";

/*
 * "Altre opzioni" di una spesa (versione 2.0): per chi è, detrazione, rimborso atteso, periodo di competenza.
 * Chiuse di default (modalità semplice); si aprono da sole se il movimento ha già dati qui.
 */

export type ExtraDraft = {
  person: string;
  deduct: "" | "yes" | "no";
  refund: boolean;
  refundAmount: string;
  refundFrom: string;
  refundReceived: string;
  competence: boolean;
  competenceFrom: string;
  competenceTo: string;
  adjustment: boolean;
};

function amountText(cents: number | undefined) {
  return cents ? (cents / 100).toFixed(2).replace(".", ",") : "";
}

export function extraDraft(extra: MovementExtra | undefined): ExtraDraft {
  return {
    person: extra?.person ?? "",
    deduct: extra?.deduct ?? "",
    refund: !!extra?.refund,
    refundAmount: amountText(extra?.refund?.amount),
    refundFrom: extra?.refund?.from ?? "",
    refundReceived: extra?.refund?.received ?? "",
    competence: !!extra?.competence,
    competenceFrom: extra?.competence?.from ?? "",
    competenceTo: extra?.competence?.to ?? "",
    adjustment: !!extra?.adjustment,
  };
}

/** Converte la bozza nei dati salvati; restituisce un messaggio se qualcosa non va. */
export function buildExtra(draft: ExtraDraft, amount: number): { extra?: MovementExtra; error?: string } {
  const extra: MovementExtra = {};
  if (draft.person) extra.person = draft.person;
  if (draft.deduct) extra.deduct = draft.deduct;
  if (draft.refund) {
    const refund = parseMoney(draft.refundAmount);
    if (refund === null || refund <= 0) return { error: "Inserisci l’importo del rimborso atteso." };
    if (refund > amount) return { error: "Il rimborso atteso non può superare l’importo della spesa." };
    extra.refund = { amount: refund, from: draft.refundFrom.trim().slice(0, 80), received: draft.refundReceived };
  }
  if (draft.competence) {
    if (!draft.competenceFrom || !draft.competenceTo || draft.competenceTo < draft.competenceFrom) {
      return { error: "Indica il periodo coperto (dal… al…), con la fine dopo l’inizio." };
    }
    extra.competence = { from: draft.competenceFrom, to: draft.competenceTo };
  }
  if (draft.adjustment) extra.adjustment = true;
  return Object.keys(extra).length ? { extra } : {};
}

export function ExtraFields({ ledger, draft, onChange, labelId, subcategory }: {
  ledger: Ledger; draft: ExtraDraft; onChange: (draft: ExtraDraft) => void; labelId: string; subcategory: string;
}) {
  const settings = ledger.settings;
  const people = moduleOn(settings, "people") ? ledger.people : [];
  const tax = moduleOn(settings, "tax");
  const refunds = moduleOn(settings, "refunds");
  const bills = moduleOn(settings, "fixed");
  if (!people.length && !tax && !refunds && !bills) return null;
  const set = (change: Partial<ExtraDraft>) => onChange({ ...draft, ...change });
  const autoKey = labelId ? deductionKey(ledger, labelId, subcategory) : null;
  const autoName = autoKey && (settings.deductions ?? []).includes(autoKey) ? deductionInfo(autoKey)?.name : null;
  const open = !!(draft.person || draft.deduct || draft.refund || draft.competence || draft.adjustment);

  return <details className="extra-options" open={open}>
    <summary><SlidersHorizontal size={14} /> Altre opzioni</summary>
    <div className="form-grid">
      {people.length > 0 && <label>Sostenuta per
        <select value={draft.person} onChange={(event) => set({ person: event.target.value })}>
          <option value="">Me stesso</option>
          {people.map((person) => <option key={person.id} value={person.id}>{personName(person)}</option>)}
        </select>
      </label>}
      {tax && <label>Detrazione
        <select value={draft.deduct} onChange={(event) => set({ deduct: event.target.value as ExtraDraft["deduct"] })}>
          <option value="">{autoName ? `Automatica: ${autoName}` : "Automatica: non detraibile"}</option>
          <option value="yes">Detraibile anche se pagata in contanti</option>
          <option value="no">Non detraibile</option>
        </select>
      </label>}
    </div>
    {refunds && <label className="check-row compact"><input type="checkbox" checked={draft.refund} onChange={(event) => set({ refund: event.target.checked })} />
      <span><strong>In attesa di rimborso</strong><small>Fondo sanitario, assicurazione, nota spese: la parte rimborsata non è detraibile.</small></span></label>}
    {refunds && draft.refund && <div className="form-grid">
      <label>Importo atteso<input inputMode="decimal" placeholder="0,00" value={draft.refundAmount} onChange={(event) => set({ refundAmount: event.target.value })} /></label>
      <label>Da chi<input maxLength={80} placeholder="Es. Fondo sanitario" value={draft.refundFrom} onChange={(event) => set({ refundFrom: event.target.value })} /></label>
      <label>Ricevuto il <span className="optional">vuoto = in attesa</span>
        <input type="date" min="1900-01-01" max="2100-12-31" value={draft.refundReceived} onChange={(event) => set({ refundReceived: event.target.value })} /></label>
    </div>}
    {bills && <label className="check-row compact"><input type="checkbox" checked={draft.competence} onChange={(event) => set({ competence: event.target.checked })} />
      <span><strong>Periodo di competenza</strong><small>Per bollette e simili: l’importo si distribuisce sui mesi coperti nei report «per competenza».</small></span></label>}
    {bills && draft.competence && <div className="form-grid">
      <label>Dal<input type="date" min="1900-01-01" max="2100-12-31" value={draft.competenceFrom} onChange={(event) => set({ competenceFrom: event.target.value })} /></label>
      <label>Al<input type="date" min="1900-01-01" max="2100-12-31" value={draft.competenceTo} onChange={(event) => set({ competenceTo: event.target.value })} /></label>
      <label className="check-row compact"><input type="checkbox" checked={draft.adjustment} onChange={(event) => set({ adjustment: event.target.checked })} />
        <span><strong>Conguaglio</strong><small>Rettifica di periodi già fatturati.</small></span></label>
    </div>}
  </details>;
}
