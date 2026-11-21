// Ricerca globale (tasto /): movimenti, conti, categorie, scadenze, familiari, ricorrenti, preferiti, obiettivi.
import { parseMoney, type Ledger } from "./ledger";

export type SearchKind = "movement" | "account" | "label" | "deadline" | "person" | "recurring" | "template" | "goal";

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  /** Riga di dettaglio (data, tipo, dove si trova). */
  detail: string;
  /** Per i movimenti: data e importo in centesimi. */
  date?: string;
  amount?: number;
  score: number;
}

const MAX_RESULTS = 30;
const MIN_QUERY = 2;

/** Minuscole e senza accenti: «Caffè» si trova cercando «caffe». */
export function normalizeText(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Punteggio: titolo che inizia con la ricerca > parola del titolo > titolo che la contiene > altri campi. */
function score(query: string, title: string, others: string[]) {
  const name = normalizeText(title);
  if (name.startsWith(query)) return 100;
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 80;
  if (name.includes(query)) return 60;
  return others.some((text) => normalizeText(text).includes(query)) ? 30 : 0;
}

export function searchLedger(ledger: Ledger, raw: string): SearchResult[] {
  const query = normalizeText(raw);
  if (query.length < MIN_QUERY) return [];
  const cents = /\d/.test(query) ? parseMoney(raw) : null;
  const results: SearchResult[] = [];
  const add = (result: Omit<SearchResult, "score">, title: string, others: string[] = []) => {
    const points = score(query, title, others);
    if (points) results.push({ ...result, score: points });
  };
  const accountName = new Map(ledger.accounts.map((account) => [account.id, account.value.name]));
  const labelName = new Map(ledger.labels.map((label) => [label.id, label.value.name]));

  for (const { id, value } of ledger.movements) {
    const category = "labelId" in value && value.labelId ? labelName.get(value.labelId) ?? "" : "";
    const detail = [category, "accountId" in value && value.accountId ? accountName.get(value.accountId) ?? "" : ""].filter(Boolean).join(" · ");
    const base = { kind: "movement" as const, id, title: value.title, detail, date: value.date, amount: value.amount };
    // Un importo scritto per intero («12,50») trova i movimenti con quella cifra.
    if (cents !== null && cents > 0 && value.amount === cents) { results.push({ ...base, score: 90 }); continue; }
    const tags = "tags" in value && Array.isArray(value.tags) ? value.tags : [];
    const subcategory = "subcategory" in value && typeof value.subcategory === "string" ? value.subcategory : "";
    add(base, value.title, [value.notes ?? "", category, subcategory, ...tags.map((tag) => `#${tag}`)]);
  }
  for (const { id, value } of ledger.accounts) add({ kind: "account", id, title: value.name, detail: value.archived ? "Conto archiviato" : "Conto" }, value.name);
  for (const { id, value } of ledger.labels) {
    const kind = value.type === "expense" ? "Categoria di spesa" : "Fonte di entrata";
    add({ kind: "label", id, title: value.name, detail: kind }, value.name, value.subcategories ?? []);
  }
  for (const { id, value } of ledger.deadlines) add({ kind: "deadline", id, title: value.title, detail: "Scadenza", date: value.date }, value.title, [value.notes]);
  for (const { id, value } of ledger.people) add({ kind: "person", id, title: `${value.firstName} ${value.lastName}`, detail: "Familiare" }, `${value.firstName} ${value.lastName}`, [value.notes ?? ""]);
  for (const { id, value } of ledger.recurring) add({ kind: "recurring", id, title: value.template.title, detail: "Movimento ricorrente", amount: value.template.amount }, value.template.title, [value.template.notes ?? ""]);
  for (const { id, value } of ledger.templates) add({ kind: "template", id, title: value.name, detail: "Preferito" }, value.name, [value.title]);
  for (const { id, value } of ledger.goals) add({ kind: "goal", id, title: value.name, detail: "Obiettivo" }, value.name);

  // Più pertinenti prima; tra i movimenti, i più recenti.
  return results.sort((a, b) => b.score - a.score || (b.date ?? "").localeCompare(a.date ?? "")).slice(0, MAX_RESULTS);
}
