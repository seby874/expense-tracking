// Pulizia delle descrizioni bancarie e chiavi per riconoscere la stessa controparte.

const COUNTRY_CODES = new Set(["it", "ie", "se", "lu", "mt", "nl", "de", "fr", "gb", "us", "es", "be", "at", "pt", "ch", "pl", "lt", "cy", "dk", "fi", "ee", "lv", "cz", "gr", "ro", "hu", "no", "ita"]);
const MONTH_WORDS = /\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|january|february|march|april|may|june|july|august|september|october|november|december)\b/g;

/** Ripara i testi scritti in UTF-8 e riletti come Latin-1 (es. «UniversitÃ » → «Università»). */
export function fixMojibake(text: string) {
  // «Ã» a fine parola con lo spazio perso è quasi sempre una «à» (es. «Libertà»).
  if (!/[ÃÂâ][\u0080-¿ -ÿ€™]/.test(text)) return text.replace(/([a-z])Ã(?=[\s,.;:!?)]|$)/g, "$1à");
  try {
    const bytes = Uint8Array.from([...text].map((char) => {
      const code = char.charCodeAt(0);
      if (code < 256) return code;
      throw new Error("non latin-1");
    }));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded;
  } catch {
    return text;
  }
}

export function normalizeSpaces(text: string) {
  return text.replace(/[  \t]/g, " ").replace(/\s+/g, " ").trim();
}

/** «MARIO ROSSI» → «Mario Rossi»; lascia stare le parole già miste (McDonald's, eBay). */
export function titleCase(text: string) {
  return text.split(" ").map((word) => {
    if (!word) return word;
    if (word !== word.toUpperCase() && word !== word.toLowerCase()) return word;
    if (word.length <= 2 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(" ");
}

function stripAccents(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Chiave stabile: minuscole, senza accenti, numeri lunghi, mesi e punteggiatura. Le carte (*1234) restano. */
export function merchantKey(text: string) {
  let value = stripAccents(text.toLowerCase());
  value = value.replace(/\*+\s?(\d{4})\b/g, " card$1 ");
  value = value.replace(MONTH_WORDS, " ");
  value = value.replace(/\b\d+[\d./:-]*\b/g, " ");
  value = value.replace(/[^a-z0-9' ]+/g, " ");
  value = value.replace(/\bcard(\d{4})\b/g, "*$1");
  value = normalizeSpaces(value);
  return value.slice(0, 120);
}

export function tokens(text: string) {
  return merchantKey(text).split(" ").filter((word) => word.length >= 3 && !/^\*/.test(word));
}

/** Toglie IBAN, codici TRN e numeri di carta dal testo salvato con il movimento. */
export function safeText(text: string) {
  return normalizeSpaces(text)
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9 ]{11,30}\b/gi, (match) => (/\d{6}/.test(match.replace(/\s/g, "")) ? "[IBAN]" : match))
    .replace(/Trn:\s*\S+/gi, "")
    .replace(/\b\d{12,}\w*\b/g, "")
    .slice(0, 300).trim();
}

export function sameTokens(a: string, b: string) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || left.size !== right.size) return false;
  for (const word of left) if (!right.has(word)) return false;
  return true;
}

function dropCountry(text: string) {
  const words = text.split(" ");
  while (words.length > 1 && COUNTRY_CODES.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.join(" ");
}

function cleanMerchant(text: string) {
  let value = text
    .replace(/\*?\b(?=[A-Za-z0-9]{6,}\b)[A-Za-z]*\d+[A-Za-z]+\d[A-Za-z0-9]*\b/g, " ")    // codici d'ordine (es. Ab12cd34ef, Xy98z76w5)
    .replace(/\*+\d*\*?/g, " ")
    .replace(/\d{5,}/g, " ");
  value = normalizeSpaces(value);
  value = dropCountry(value);
  value = value.replace(/^(sumup|sq|zettle|pp|paypal)\s*\*\s*/i, "");
  return titleCase(normalizeSpaces(value)).slice(0, 160);
}

export type Described = {
  title: string;
  key: string;
  /** Persona o ditta dall'altra parte (bonifici, pagamenti tra persone). */
  counterpart?: string;
  direction?: "in" | "out";
  /** Ultime 4 cifre della carta che ha fatto una ricarica. */
  card?: string;
  /** Banca indicata nel bonifico (es. "Revolut"). */
  bank?: string;
  /** Data dell'operazione scritta nella descrizione (pagamenti con carta). */
  date?: string;
  cash?: boolean;
  refund?: boolean;
  /** Bonifico tra due conti della stessa persona (ordinante = beneficiario). */
  self?: boolean;
};

function shortDateToIso(day: string, month: string, year: string) {
  const full = year.length === 2 ? `20${year}` : year;
  return `${full}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** Interpreta la descrizione di una riga dell'estratto conto. */
export function describe(raw: string, bankType = ""): Described {
  const text = normalizeSpaces(fixMojibake(raw));
  const type = bankType.toLowerCase();
  const refund = /rimborso|chargeback|refund/.test(type) || /^(rimborso|storno|sconto|refund|reso)\b/i.test(text);

  // Bonifico in entrata (Fineco): Ordinante … Beneficiario … Banca Ordinante … Causale …
  let match = text.match(/^Ord(?:inante)?:\s*(.+?)\s+Ben(?:eficiario)?:\s*(.+?)\s+(?:Dt-Ord:.*?\s+)?Banca Ord(?:inante)?:\s*(.+?)(?:\s+Data\b|\s+Info-Cli:|$)/i);
  if (match) {
    const causale = text.match(/(?:Causale|Info-Cli):\s*(.*)$/i)?.[1]?.trim() ?? "";
    const name = titleCase(match[1].trim());
    const bank = titleCase(match[3].replace(/\b(s\.?p\.?a\.?|uab|italy|br|s\.?r\.?l\.?|-\s*p)\b/gi, "").replace(/\s+-\s*$/, "").trim());
    return {
      title: `Bonifico da ${name}${causale ? ` · ${titleCase(causale).slice(0, 60)}` : ""}`.slice(0, 160),
      key: merchantKey(`da ${name}`), counterpart: name, direction: "in", bank, refund,
      self: sameTokens(match[1], match[2]),
    };
  }
  // Bonifico in uscita (Fineco): Beneficiario … Iban … Causale …
  match = text.match(/^Beneficiario:\s*(.+?)\s+Iban:/i);
  if (match) {
    const causale = text.match(/Causale:\s*(.+?)(?:\s+Trn:|$)/i)?.[1]?.trim() ?? "";
    const name = titleCase(match[1].trim());
    return {
      title: `Bonifico a ${name}${causale ? ` · ${titleCase(causale).slice(0, 60)}` : ""}`.slice(0, 160),
      key: merchantKey(`a ${name}`), counterpart: name, direction: "out",
    };
  }
  // Pagamento POS (Fineco): Pag. del 14/07/26 Ora 14:16 Presso: Nome Via …
  match = text.match(/^Pag\. del (\d{2})\/(\d{2})\/(\d{2,4}).*?Presso:\s*(.+?)(?:\s+(?:Via|V\.le|Viale|Piazza|P\.zza|Corso|C\.so|Largo|Contrada|C\.da|Loc\.|Localita)\b|\s+\d{5}\b|\s+Carta\b|$)/i);
  if (match) {
    const name = cleanMerchant(match[4]);
    return { title: name, key: merchantKey(name), date: shortDateToIso(match[1], match[2], match[3]), refund };
  }
  // Pagamento con carta (Fineco): Esercente Città It Carta N. ***** 685 Data Operazione 01/07/26
  match = text.match(/^(.*?)\s+Carta N[.°]?\s*\*+\s*\d+.*?(?:Data Operazione\s+(\d{2})\/(\d{2})\/(\d{2,4}))?\s*$/i);
  if (match) {
    const name = cleanMerchant(match[1]);
    return { title: name || "Pagamento con carta", key: merchantKey(name || "pagamento carta"), date: match[2] ? shortDateToIso(match[2], match[3], match[4]) : undefined, refund };
  }
  // Ricarica da un'altra carta (Revolut): «Ricarica di Google Pay con *1234», «Ricarica di *9876».
  match = text.match(/^(?:Ricarica|Top-Up|Top up)\b.*?(?:\*+(\d{4})|\*{3,})\s*$/i);
  if (match) {
    return match[1]
      ? { title: `Ricarica da carta *${match[1]}`, key: `ricarica *${match[1]}`, card: match[1], direction: "in" }
      : { title: "Ricarica da carta", key: "ricarica carta", direction: "in" };
  }
  // Pagamenti tra persone (Revolut).
  match = text.match(/^(?:Pagamento da parte di|Pagamento da|Payment from|From)\s+(.+)$/i);
  if (match) {
    const name = titleCase(match[1].trim());
    return { title: `Da ${name}`, key: merchantKey(`da ${name}`), counterpart: name, direction: "in", refund };
  }
  match = text.match(/^(?:Pagamento a favore di|To|Transfer to|Payment to)\s+(.+)$/i);
  if (match) {
    const name = titleCase(match[1].trim());
    return { title: `A ${name}`, key: merchantKey(`a ${name}`), counterpart: name, direction: "out" };
  }
  // Prelievo di contanti.
  match = text.match(/^(?:Prelievo(?: di contanti)?|Prelevamento|Cash withdrawal(?: at)?|ATM)\b\s*(?:presso|at)?\s*(.*)$/i);
  if (match || /prelievo|atm|cash/.test(type)) {
    const where = cleanMerchant(match?.[1] ?? "");
    return { title: `Prelievo contanti${where ? ` · ${where}` : ""}`.slice(0, 160), key: "prelievo contanti", cash: true };
  }
  // Bonifici scritti in modo libero da altre banche: «BONIFICO A FAVORE DI MARIO ROSSI - AFFITTO».
  match = text.match(/^(?:bonifico|bon\.?|sepa credit transfer|giroconto)\s+(?:sepa\s+)?(a favore di|a|verso|per|disposto a|da|di|ricevuto da|in entrata da)\s+(.+?)(?:\s+-\s+|\s+causale:?\s+|$)(.*)$/i);
  if (match) {
    const incoming = /^(da|di|ricevuto da|in entrata da)$/i.test(match[1]);
    const name = titleCase(match[2].replace(/\s+/g, " ").trim()).slice(0, 80);
    const causale = titleCase(match[3].trim()).slice(0, 60);
    return {
      title: `Bonifico ${incoming ? "da" : "a"} ${name}${causale ? ` · ${causale}` : ""}`.slice(0, 160),
      key: merchantKey(`${incoming ? "da" : "a"} ${name}`), counterpart: name, direction: incoming ? "in" : "out", refund,
    };
  }
  // Prefissi generici dei pagamenti con carta di altre banche.
  const stripped = text.replace(/^(?:pagamento\s+(?:pos|carta|con carta|contactless)|pag\.?\s*pos|acquisto(?:\s+pos)?|operazione\s+(?:pos|carta)|addebito\s+(?:carta|pos)|card payment|pos)\s+(?:del\s+\S+\s+)?/i, "");
  const name = cleanMerchant(stripped) || cleanMerchant(text) || text.slice(0, 160);
  return { title: name, key: merchantKey(name) || merchantKey(text) || "movimento", refund };
}

/**
 * Due controparti «simili»: le parole di una sono tutte nell'altra (es. «spotify» e «spotify stockholm»).
 * Una sola parola vale solo se è lunga almeno 5 lettere, per non confondere nomi brevi.
 */
const GENERIC_WORDS = new Set(["ricarica", "pagamento", "bonifico", "prelievo", "contanti", "commissione", "commissioni", "carta", "giroconto",
  "trasferimento", "accredito", "addebito", "rimborso", "storno", "sconto", "canone", "spese", "the", "and", "per", "con", "del", "della"]);

export function similarKeys(a: string, b: string) {
  if (a === b) return true;
  // Carte diverse (*1234) = controparti diverse.
  const cardsA = (a.match(/\*\d{4}/g) ?? []).sort().join();
  const cardsB = (b.match(/\*\d{4}/g) ?? []).sort().join();
  if (cardsA !== cardsB) return false;
  const left = [...new Set(tokens(a).filter((word) => !GENERIC_WORDS.has(word)))];
  const right = [...new Set(tokens(b).filter((word) => !GENERIC_WORDS.has(word)))];
  const [small, large] = left.length <= right.length ? [left, right] : [right, left];
  if (!small.length) return false;
  if (small.length === 1 && small[0].length < 5) return false;
  return small.every((word) => large.includes(word));
}
