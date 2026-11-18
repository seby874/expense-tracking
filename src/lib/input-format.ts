// Testo iniziale dei campi numerici modificabili: formato italiano, riletto senza perdite da parseMoney.

/** Centesimi → «100.000,00» (punto per le migliaia, virgola per i decimali); vuoto se il valore manca. */
export function euroInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const [whole, decimals] = (Math.abs(cents) / 100).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cents < 0 ? "-" : ""}${grouped},${decimals}`;
}

/** Percentuale con la virgola decimale (0.2 → «0,2»). */
export function percentInput(value: number): string {
  return String(value).replace(".", ",");
}
