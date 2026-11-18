// Riquadri su due colonne indipendenti: niente più vuoti sotto i riquadri corti (Panoramica, Analisi).
import type { CSSProperties, ReactNode } from "react";

export interface BoardItem {
  key: string;
  node: ReactNode;
  /** Altezza stimata, solo per scegliere la colonna più corta (1 = riquadro basso). */
  weight?: number;
  /** Occupa tutta la larghezza e separa i gruppi di riquadri. */
  full?: boolean;
  className?: string;
}

type Segment = { full: BoardItem } | { columns: [BoardItem[], BoardItem[]] };

/** Divide i riquadri in gruppi separati da quelli larghi; ogni riquadro va nella colonna più corta. */
export function boardSegments(items: BoardItem[]): Segment[] {
  const segments: Segment[] = [];
  let columns: [BoardItem[], BoardItem[]] = [[], []];
  let heights = [0, 0];
  const flush = () => {
    if (columns[0].length || columns[1].length) segments.push({ columns });
    columns = [[], []];
    heights = [0, 0];
  };
  for (const item of items) {
    if (item.full) { flush(); segments.push({ full: item }); continue; }
    const side = heights[1] < heights[0] ? 1 : 0;
    columns[side] = [...columns[side], item];
    heights[side] += item.weight ?? 2;
  }
  flush();
  return segments;
}

export function Board({ items, className = "" }: { items: BoardItem[]; className?: string }) {
  // L'ordine originale resta in «order»: sul telefono le colonne si sciolgono e i riquadri tornano nell'ordine scelto.
  const position = new Map(items.map((item, index) => [item.key, index]));
  const cell = (item: BoardItem) => <div key={item.key} className={`widget widget-${item.key}${item.full ? " widget-full" : ""}${item.className ? ` ${item.className}` : ""}`}
    style={{ order: position.get(item.key) } as CSSProperties}>{item.node}</div>;
  return <div className={`board ${className}`.trim()}>
    {boardSegments(items).map((segment, index) => "full" in segment ? cell(segment.full)
      : <div className="board-columns" key={`columns-${index}`}
        style={{ order: Math.min(...[...segment.columns[0], ...segment.columns[1]].map((item) => position.get(item.key) ?? 0)) } as CSSProperties}>
        <div className="board-col">{segment.columns[0].map(cell)}</div>
        <div className="board-col">{segment.columns[1].map(cell)}</div>
      </div>)}
  </div>;
}
