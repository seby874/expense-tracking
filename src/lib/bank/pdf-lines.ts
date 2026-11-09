// Estrae il testo di un PDF con la posizione di ogni pezzo, riga per riga.
// pdf.js si carica solo quando serve (la prima volta che si importa un PDF).

export type PdfCell = { x: number; right: number; text: string };
export type PdfLine = { page: number; y: number; cells: PdfCell[]; text: string };

type TextItem = { str: string; transform: number[]; width: number };

export async function pdfLines(data: ArrayBuffer): Promise<PdfLine[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true, useSystemFonts: false, stopAtErrors: false });
  const document = await task.promise;
  const lines: PdfLine[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 60); pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = (content.items as unknown[]).filter((item): item is TextItem => typeof (item as TextItem).str === "string" && (item as TextItem).str.trim() !== "");
      // Raggruppa per riga (stessa altezza, con tolleranza).
      const rows: { y: number; items: TextItem[] }[] = [];
      for (const item of items) {
        const y = item.transform[5];
        const row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.2);
        if (row) row.items.push(item); else rows.push({ y, items: [item] });
      }
      rows.sort((a, b) => b.y - a.y);
      for (const row of rows) {
        row.items.sort((a, b) => a.transform[4] - b.transform[4]);
        // Unisce i pezzi vicini in celle (le colonne sono separate da spazi larghi).
        const cells: PdfCell[] = [];
        for (const item of row.items) {
          const x = item.transform[4];
          const right = x + item.width;
          const last = cells[cells.length - 1];
          if (last && x - last.right < 3.5) {
            last.text += (x - last.right > 0.8 && !last.text.endsWith(" ") ? " " : "") + item.str;
            last.right = Math.max(last.right, right);
          } else cells.push({ x, right, text: item.str });
        }
        for (const cell of cells) cell.text = cell.text.replace(/\s+/g, " ").trim();
        const kept = cells.filter((cell) => cell.text);
        lines.push({ page: pageNumber, y: row.y, cells: kept, text: kept.map((cell) => cell.text).join("  ") });
      }
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return lines;
}
