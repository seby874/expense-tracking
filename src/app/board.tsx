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

type Segment = { full: BoardItem } | { columns: BoardItem[][] };

/** Divide i riquadri in gruppi separati da quelli larghi; ogni riquadro va nella colonna più corta. */
export function boardSegments(items: BoardItem[], count = 2): Segment[] {
  const segments: Segment[] = [];
  const empty = () => Array.from({ length: count }, () => [] as BoardItem[]);
  let columns = empty();
  let heights = Array<number>(count).fill(0);
  const flush = () => {
    if (columns.some((column) => column.length)) segments.push({ columns });
    columns = empty();
    heights = Array<number>(count).fill(0);
  };
  for (const item of items) {
    if (item.full && count > 1) { flush(); segments.push({ full: item }); continue; }
    const side = heights.indexOf(Math.min(...heights));
    columns[side] = [...columns[side], item];
    heights[side] += item.weight ?? 2;
  }
  flush();
  return segments;
}

export function Board({ items, className = "", columns = 2 }: { items: BoardItem[]; className?: string; columns?: number }) {
  // L'ordine originale resta in «order»: sul telefono le colonne si sciolgono e i riquadri tornano nell'ordine scelto.
  const position = new Map(items.map((item, index) => [item.key, index]));
  const cell = (item: BoardItem) => <div key={item.key} className={`widget widget-${item.key}${item.full ? " widget-full" : ""}${item.className ? ` ${item.className}` : ""}`}
    style={{ order: position.get(item.key) } as CSSProperties}>{item.node}</div>;
  return <div className={`board ${className}`.trim()}>
    {boardSegments(items, columns).map((segment, index) => "full" in segment ? cell(segment.full)
      : <div className="board-columns" key={`columns-${index}`}
        style={{ order: Math.min(...segment.columns.flat().map((item) => position.get(item.key) ?? 0)), "--board-cols": columns } as CSSProperties}>
        {segment.columns.map((column, side) => <div className="board-col" key={side}>{column.map(cell)}</div>)}
      </div>)}
  </div>;
}
