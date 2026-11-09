// Lettura degli estratti conto: Revolut (CSV), Fineco (PDF) e CSV generici di altre banche.
// Tutto avviene nel browser: il file non viene inviato da nessuna parte.

import { parseCsv } from "../data-io";
import { parseMoney } from "../ledger";
import { fixMojibake, merchantKey, normalizeSpaces, titleCase } from "./text";
import type { PdfLine } from "./pdf-lines";

export type BankRow = {
  index: number;
  date: string;
  amount: number;          // centesimi con segno: + entra, − esce (commissioni escluse)
  fee: number;             // commissione addebitata a parte (≥ 0)
  raw: string;
  bankType: string;
  skip?: string;           // motivo per cui la banca non l'ha contabilizzata
  completed?: string;      // data e ora di contabilizzazione, per ordinare i saldi
};

export type BankProduct = {
  key: string;             // "revolut:attuale"
  bank: string;
  label: string;
  suggestedName: string;
  rows: BankRow[];
  finalBalance: number | null;
  cards: string[];
  holder?: string;
};

export type CsvMapping = { headerRow: number; date: number; amount: number; debit: number; credit: number; description: number[]; balance: number };

export type BankStatement = {
  file: string;
  format: "revolut" | "fineco-pdf" | "csv";
  products: BankProduct[];
  warnings: string[];
  csv?: { rows: string[][]; mapping: CsvMapping; columns: string[] };
};

function slug(text: string) {
  return merchantKey(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "conto";
}

function pad(value: string) {
  return value.padStart(2, "0");
}

/** Date in formati comuni → AAAA-MM-GG (null se non valida). */
export function parseBankDate(raw: string): string | null {
  const text = raw.trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let iso = match ? `${match[1]}-${pad(match[2])}-${pad(match[3])}` : "";
  if (!iso) {
    match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
    if (match) iso = `${match[3].length === 2 ? "20" + match[3] : match[3]}-${pad(match[2])}-${pad(match[1])}`;
  }
  if (!iso) return null;
  const date = new Date(iso + "T12:00:00Z");
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso && iso >= "1990-01-01" && iso <= "2100-12-31" ? iso : null;
}

/** Importi con punto o virgola decimale, segno e simboli di valuta. */
export function parseBankAmount(raw: string): number | null {
  const text = raw.trim().replace(/[€\s ]|EUR/gi, "").replace(/^\((.*)\)$/, "-$1");
  if (!text) return null;
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) {
    const cents = Math.round(Number(text) * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }
  return parseMoney(text.replace(/^\+/, ""));
}

// ---------------------------------------------------------------- Revolut

const REVOLUT_COLUMNS = {
  type: ["tipo", "type"],
  product: ["prodotto", "product"],
  started: ["data di inizio", "started date"],
  completed: ["data di completamento", "completed date"],
  description: ["descrizione", "description"],
  amount: ["importo", "amount"],
  fee: ["costo", "commissione", "fee"],
  currency: ["valuta", "currency"],
  state: ["state", "stato"],
  balance: ["saldo", "balance"],
};

function revolutIndex(header: string[]) {
  const cells = header.map((cell) => normalizeSpaces(cell).toLowerCase());
  const find = (names: string[]) => cells.findIndex((cell) => names.includes(cell));
  return Object.fromEntries(Object.entries(REVOLUT_COLUMNS).map(([key, names]) => [key, find(names)])) as Record<keyof typeof REVOLUT_COLUMNS, number>;
}

export function isRevolut(header: string[]) {
  const index = revolutIndex(header);
  return index.product >= 0 && index.started >= 0 && index.completed >= 0 && index.amount >= 0 && index.description >= 0;
}

function paddedTime(value: string) {
  // "2024-12-25 3:05:13" → "2024-12-25 03:05:13", per ordinare come testo.
  return value.trim().replace(/ (\d):/, " 0$1:");
}

function parseRevolut(file: string, rows: string[][]): BankStatement {
  const index = revolutIndex(rows[0]);
  const products = new Map<string, BankProduct>();
  const last = new Map<string, { completed: string; balance: number }>();
  rows.slice(1).forEach((row, position) => {
    const cell = (column: number) => (column >= 0 ? (row[column] ?? "").trim() : "");
    const productName = cell(index.product) || "Attuale";
    const key = `revolut:${slug(productName)}`;
    let product = products.get(key);
    if (!product) {
      const main = /^(attuale|current)$/i.test(productName);
      product = {
        key, bank: "Revolut", label: `Revolut · ${titleCase(productName)}`,
        suggestedName: main ? "Revolut" : `Revolut ${titleCase(productName)}`.slice(0, 100),
        rows: [], finalBalance: null, cards: [],
      };
      products.set(key, product);
    }
    const date = parseBankDate(cell(index.started)) ?? parseBankDate(cell(index.completed));
    const amount = parseBankAmount(cell(index.amount));
    if (!date || amount === null) return;
    const fee = Math.abs(parseBankAmount(cell(index.fee)) ?? 0);
    const state = cell(index.state);
    const currency = cell(index.currency).toUpperCase();
    const done = !state || /complet/i.test(state);
    const item: BankRow = {
      index: position, date, amount, fee, raw: normalizeSpaces(fixMojibake(index.description >= 0 ? row[index.description] ?? "" : "")), bankType: cell(index.type),
      completed: done ? paddedTime(cell(index.completed) || cell(index.started)) : undefined,
    };
    if (currency && currency !== "EUR") item.skip = `in ${currency}: l’app gestisce solo euro`;
    else if (!done) item.skip = /annull|revert|declin|rifiut/i.test(state) ? "operazione annullata" : "non ancora contabilizzata";
    product.rows.push(item);
    const balance = parseBankAmount(cell(index.balance));
    if (done && balance !== null && item.completed) {
      const previous = last.get(key);
      if (!previous || item.completed >= previous.completed) last.set(key, { completed: item.completed, balance });
    }
  });
  for (const product of products.values()) product.finalBalance = last.get(product.key)?.balance ?? null;
  return { file, format: "revolut", products: [...products.values()].filter((product) => product.rows.length), warnings: [] };
}

// ---------------------------------------------------------------- Fineco (PDF)

const FOOTER = /^(FinecoBank|interamente|Codice Fiscale|PEC:|segue a pagina|PAGINA \d|Estratto conto|001 L\d|Imposta di bollo|DATA|OPERAZIONE|\?)/i;
const AMOUNT = /^[+-]?\d{1,3}(?:\.\d{3})*,\d{2}$/;
const SHORT_DATE = /^(\d{2})\.(\d{2})\.(\d{2})$/;

function finecoDate(text: string) {
  const match = text.match(SHORT_DATE);
  return match ? parseBankDate(`${match[1]}/${match[2]}/20${match[3]}`) : null;
}

export function isFinecoText(lines: PdfLine[]) {
  return lines.some((line) => /FinecoBank/i.test(line.text)) && lines.some((line) => /USCITE/.test(line.text) && /ENTRATE/.test(line.text));
}

export function parseFinecoPdf(file: string, lines: PdfLine[]): BankStatement {
  const all = lines.map((line) => line.text).join("\n");
  const cards = [...new Set([...all.matchAll(/\b\d{4}\s\*{4}\s\*{4}\s(\d{4})\b/g)].map((match) => match[1]))];
  const account = all.match(/NUMERO CONTO[\s\S]{0,200}?\b(\d{9,14})\b/)?.[1] ?? "";
  const holderLine = lines.findIndex((line) => /^\??\s*Intestatari\b/i.test(line.text));
  const holder = holderLine >= 0 ? titleCase(normalizeSpaces(lines[holderLine + 1]?.text ?? "")).slice(0, 100) : undefined;

  const rows: BankRow[] = [];
  let initial: number | null = null;
  let final: number | null = null;
  let columns: { out: number; in: number; description: number } | null = null;
  let current: { row: BankRow; descriptionX: number } | null = null;
  let inMovements = false;

  for (const line of lines) {
    const header = line.cells.find((cell) => cell.text === "USCITE") && line.cells.find((cell) => cell.text === "ENTRATE");
    if (header) {
      const out = line.cells.find((cell) => cell.text === "USCITE")!;
      const inCell = line.cells.find((cell) => cell.text === "ENTRATE")!;
      const description = line.cells.find((cell) => /^DESCRIZIONE/.test(cell.text));
      columns = { out: out.right, in: inCell.right, description: description?.x ?? inCell.right + 10 };
      inMovements = true;
      current = null;
      continue;
    }
    if (!inMovements || !columns) continue;
    const text = line.text;
    if (/Saldo iniziale in euro/i.test(text)) {
      const amount = line.cells.find((cell) => AMOUNT.test(cell.text));
      if (amount) initial = parseMoney(amount.text.replace("+", ""));
      continue;
    }
    if (/Saldo finale in euro/i.test(text)) {
      const amount = line.cells.find((cell) => AMOUNT.test(cell.text));
      if (amount) final = parseMoney(amount.text.replace("+", ""));
      current = null;
      inMovements = false;
      continue;
    }
    const [first, second] = line.cells;
    const booked = first ? finecoDate(first.text) : null;
    const value = second ? finecoDate(second.text) : null;
    if (booked && value) {
      const amountCell = line.cells.slice(2).find((cell) => AMOUNT.test(cell.text));
      if (!amountCell) continue;
      const cents = parseMoney(amountCell.text.replace("+", ""));
      if (cents === null) continue;
      const outgoing = Math.abs(amountCell.right - columns.out) <= Math.abs(amountCell.right - columns.in);
      const descriptionCells = line.cells.slice(2).filter((cell) => cell !== amountCell && cell.x >= amountCell.right - 1);
      const descriptionX = descriptionCells[0]?.x ?? columns.description;
      const row: BankRow = {
        index: rows.length, date: value, amount: outgoing ? -Math.abs(cents) : Math.abs(cents), fee: 0,
        raw: descriptionCells.map((cell) => cell.text).join(" "), bankType: "", completed: booked,
      };
      rows.push(row);
      current = { row, descriptionX };
      continue;
    }
    // Continuazione della descrizione (stessa colonna, prima di intestazioni e piè di pagina).
    if (current && line.cells.length && !FOOTER.test(text) && Math.abs(line.cells[0].x - current.descriptionX) <= 25) {
      current.row.raw = normalizeSpaces(`${current.row.raw} ${text}`);
    } else if (FOOTER.test(text) || (line.cells[0] && line.cells[0].x > columns.description + 200)) {
      // piè di pagina o codici a destra: la riga successiva può ancora continuare la descrizione
    } else {
      current = null;
    }
  }

  // La data dell'operazione scritta nella descrizione (carte) vale più di quella di valuta.
  for (const row of rows) {
    const match = row.raw.match(/Data Operazione (\d{2})\/(\d{2})\/(\d{2,4})/i) ?? row.raw.match(/^Pag\. del (\d{2})\/(\d{2})\/(\d{2,4})/i);
    const date = match ? parseBankDate(`${match[1]}/${match[2]}/${match[3]}`) : null;
    if (date) row.date = date;
  }

  const warnings: string[] = [];
  if (initial !== null && final !== null) {
    const sum = rows.reduce((total, row) => total + row.amount, 0);
    if (initial + sum !== final) warnings.push("La somma dei movimenti letti non torna con il saldo finale del PDF: controlla l’anteprima.");
  }
  if (!rows.length) warnings.push("Nessun movimento trovato nel PDF.");
  return {
    file, format: "fineco-pdf", warnings,
    products: [{
      key: `fineco:${account || "conto"}`, bank: "Fineco", label: `Fineco · Conto ${account ? "…" + account.slice(-4) : "corrente"}`,
      suggestedName: "Fineco", rows, finalBalance: final, cards, holder,
    }],
  };
}

// ---------------------------------------------------------------- CSV generici

const HEADER_WORDS = {
  date: /^(data( operazione| contabile| valuta| movimento)?|date|booking date|transaction date|giorno)$/,
  amount: /^(importo|importo eur|importo \(eur\)|importo in euro|amount|valore|euro|eur|movimento)$/,
  debit: /^(uscite|addebiti|addebito|dare|debit|importo dare|uscita)$/,
  credit: /^(entrate|accrediti|accredito|avere|credit|importo avere|entrata)$/,
  description: /(descrizione|causale|description|dettagli|details|beneficiario|esercente|merchant|operazione|note|controparte)/,
  balance: /^(saldo|balance|saldo contabile|saldo disponibile)$/,
};

function columnSamples(rows: string[][], start: number, column: number) {
  return rows.slice(start, start + 40).map((row) => (row[column] ?? "").trim()).filter(Boolean);
}

/** Riconosce le colonne di un CSV di una banca qualsiasi (modificabili poi dall'anteprima). */
export function guessMapping(rows: string[][]): CsvMapping {
  let headerRow = 0;
  let best = -1;
  rows.slice(0, 15).forEach((row, position) => {
    const cells = row.map((cell) => normalizeSpaces(cell).toLowerCase());
    const score = cells.filter((cell) => Object.values(HEADER_WORDS).some((pattern) => pattern.test(cell))).length;
    if (score > best) { best = score; headerRow = position; }
  });
  const header = (rows[headerRow] ?? []).map((cell) => normalizeSpaces(cell).toLowerCase());
  const width = Math.max(...rows.slice(headerRow, headerRow + 20).map((row) => row.length), 0);
  const dataStart = best > 0 ? headerRow + 1 : 0;
  const share = (column: number, test: (value: string) => boolean) => {
    const samples = columnSamples(rows, dataStart, column);
    return samples.length ? samples.filter(test).length / samples.length : 0;
  };
  const columnsWhere = (test: (column: number) => boolean) => Array.from({ length: width }, (_, column) => column).filter(test);
  const byHeader = (pattern: RegExp) => header.findIndex((cell) => pattern.test(cell));

  let date = byHeader(HEADER_WORDS.date);
  if (date < 0 || share(date, (value) => !!parseBankDate(value)) < 0.7) date = columnsWhere((column) => share(column, (value) => !!parseBankDate(value)) >= 0.8)[0] ?? -1;
  const debit = byHeader(HEADER_WORDS.debit);
  const credit = byHeader(HEADER_WORDS.credit);
  let amount = debit >= 0 && credit >= 0 ? -1 : byHeader(HEADER_WORDS.amount);
  if (amount < 0 && !(debit >= 0 && credit >= 0)) {
    amount = columnsWhere((column) => column !== date && share(column, (value) => parseBankAmount(value) !== null) >= 0.8
      && columnSamples(rows, dataStart, column).some((value) => /^-|^\(/.test(value.trim())))[0] ?? -1;
  }
  const balance = byHeader(HEADER_WORDS.balance);
  let description = header.map((cell, column) => (HEADER_WORDS.description.test(cell) && column !== date ? column : -1)).filter((column) => column >= 0);
  if (!description.length) {
    const textColumns = columnsWhere((column) => ![date, amount, debit, credit, balance].includes(column));
    const longest = textColumns.sort((a, b) => columnSamples(rows, dataStart, b).join("").length - columnSamples(rows, dataStart, a).join("").length)[0];
    description = longest !== undefined ? [longest] : [];
  }
  return { headerRow: best > 0 ? headerRow : -1, date, amount, debit, credit, description, balance };
}

export function csvColumns(rows: string[][], mapping: CsvMapping) {
  const header = mapping.headerRow >= 0 ? rows[mapping.headerRow] : [];
  const width = Math.max(...rows.slice(0, 30).map((row) => row.length), 0);
  return Array.from({ length: width }, (_, column) => normalizeSpaces(header?.[column] ?? "") || `Colonna ${column + 1}`);
}

export function parseGenericCsv(file: string, rows: string[][], mapping = guessMapping(rows)): BankStatement {
  const warnings: string[] = [];
  const parsed: BankRow[] = [];
  const balances: { position: number; date: string; balance: number }[] = [];
  rows.slice(mapping.headerRow + 1).forEach((row, position) => {
    const cell = (column: number) => (column >= 0 ? (row[column] ?? "").trim() : "");
    const date = parseBankDate(cell(mapping.date));
    let amount: number | null = null;
    if (mapping.amount >= 0) amount = parseBankAmount(cell(mapping.amount));
    else if (mapping.debit >= 0 || mapping.credit >= 0) {
      const out = parseBankAmount(cell(mapping.debit)) ?? 0;
      const inc = parseBankAmount(cell(mapping.credit)) ?? 0;
      amount = (inc ? Math.abs(inc) : 0) - (out ? Math.abs(out) : 0);
      if (!cell(mapping.debit) && !cell(mapping.credit)) amount = null;
    }
    if (!date || amount === null || amount === 0) return;
    const raw = normalizeSpaces(fixMojibake(mapping.description.map((column) => row[column] ?? "").filter((text) => text.trim()).join(" · ")));
    parsed.push({ index: position, date, amount, fee: 0, raw: raw || "Movimento", bankType: "", completed: date });
    const balance = parseBankAmount(cell(mapping.balance));
    if (mapping.balance >= 0 && balance !== null) balances.push({ position, date, balance });
  });
  let finalBalance: number | null = null;
  if (balances.length) {
    // Il saldo finale è quello della riga più recente (alcune banche elencano dal più recente).
    const newestFirst = balances[0].date > balances[balances.length - 1].date;
    finalBalance = newestFirst ? balances[0].balance : balances[balances.length - 1].balance;
  }
  if (mapping.date < 0) warnings.push("Non trovo la colonna della data: sceglila qui sotto.");
  if (mapping.amount < 0 && mapping.debit < 0 && mapping.credit < 0) warnings.push("Non trovo la colonna dell’importo: sceglila qui sotto.");
  const name = file.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 60);
  return {
    file, format: "csv", warnings,
    products: [{ key: `csv:${slug(csvColumns(rows, mapping).join(" "))}`, bank: "CSV", label: `File ${name}`, suggestedName: titleCase(name).slice(0, 100) || "Conto", rows: parsed, finalBalance, cards: [] }],
    csv: { rows, mapping, columns: csvColumns(rows, mapping) },
  };
}

// ---------------------------------------------------------------- Ingresso

export type ReadResult = { kind: "bank"; statement: BankStatement } | { kind: "app"; text: string } | { kind: "error"; message: string };

/** Capisce che file è: estratto conto (Revolut, Fineco PDF, CSV di banca) o file dell'app. */
export async function readStatementFile(file: File): Promise<ReadResult> {
  const buffer = await file.arrayBuffer();
  const head = new TextDecoder("latin1").decode(buffer.slice(0, 5));
  if (head.startsWith("%PDF")) {
    const { pdfLines } = await import("./pdf-lines");
    let lines: PdfLine[];
    try {
      lines = await pdfLines(buffer);
    } catch {
      return { kind: "error", message: "Impossibile leggere il PDF (protetto o danneggiato?)." };
    }
    if (isFinecoText(lines)) return { kind: "bank", statement: parseFinecoPdf(file.name, lines) };
    if (!lines.length) return { kind: "error", message: "Il PDF non contiene testo (forse è una scansione): esporta i movimenti in CSV dalla tua banca." };
    return { kind: "error", message: "Questo PDF non è un estratto conto Fineco: per le altre banche esporta i movimenti in CSV." };
  }
  if (/\.(xlsx?|ods)$/i.test(file.name)) return { kind: "error", message: "I file Excel non sono ancora supportati: aprili e salvali come CSV, oppure esporta in CSV dalla banca." };
  let text = new TextDecoder("utf-8").decode(buffer);
  if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buffer);
  const trimmed = text.replace(/^﻿/, "").trimStart();
  if (/\.json$/i.test(file.name) || trimmed.startsWith("{")) return { kind: "app", text };
  const rows = parseCsv(text);
  if (!rows.length) return { kind: "error", message: "Il file è vuoto." };
  const header = rows[0].map((cell) => normalizeSpaces(cell.replace(/^'/, "")).toLowerCase());
  // CSV esportati dall'app stessa.
  if ((header.includes("data") && header.includes("tipo") && header.includes("importo eur")) || (header.includes("mese") && header.includes("saldo netto eur"))) return { kind: "app", text };
  if (isRevolut(rows[0])) return { kind: "bank", statement: parseRevolut(file.name, rows) };
  const statement = parseGenericCsv(file.name, rows);
  if (!statement.products[0].rows.length && !statement.warnings.length) statement.warnings.push("Nessun movimento riconosciuto: controlla le colonne.");
  return { kind: "bank", statement };
}
