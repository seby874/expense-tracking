/*
 * File .zip minimale (senza compressione, formato "store"), senza librerie esterne:
 * si apre con qualunque programma (Esplora risorse, Finder, 7-Zip).
 * Il lettore serve solo per i file creati da questa app.
 */

export type ZipEntry = { name: string; data: Uint8Array };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let crcTable: Uint32Array | null = null;

export function crc32(data: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export function textEntry(name: string, text: string): ZipEntry {
  return { name, data: encoder.encode(text) };
}

/** Crea un archivio .zip con i file indicati (nomi in UTF-8). */
export function createZip(entries: ZipEntry[], date = new Date()): Uint8Array {
  const { time, day } = dosDateTime(date);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true); // nomi in UTF-8
    view.setUint16(8, 0, true);      // nessuna compressione
    view.setUint16(10, time, true);
    view.setUint16(12, day, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, entry.data.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cview = new DataView(central.buffer);
    cview.setUint32(0, 0x02014b50, true);
    cview.setUint16(4, 20, true);
    cview.setUint16(6, 20, true);
    cview.setUint16(8, 0x0800, true);
    cview.setUint16(10, 0, true);
    cview.setUint16(12, time, true);
    cview.setUint16(14, day, true);
    cview.setUint32(16, crc, true);
    cview.setUint32(20, entry.data.length, true);
    cview.setUint32(24, entry.data.length, true);
    cview.setUint16(28, name.length, true);
    cview.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + entry.data.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const eview = new DataView(end.buffer);
  eview.setUint32(0, 0x06054b50, true);
  eview.setUint16(8, entries.length, true);
  eview.setUint16(10, entries.length, true);
  eview.setUint32(12, centralSize, true);
  eview.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let position = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, position); position += part.length; }
  return out;
}

/** Legge un .zip senza compressione (quelli creati dall'app). Lancia un errore se non è leggibile. */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { endOffset = i; break; }
  }
  if (endOffset < 0) throw new Error("Il file non è un archivio .zip valido.");
  const count = view.getUint16(endOffset + 10, true);
  let position = view.getUint32(endOffset + 16, true);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (position + 46 > bytes.length || view.getUint32(position, true) !== 0x02014b50) throw new Error("Archivio .zip danneggiato.");
    const method = view.getUint16(position + 10, true);
    const size = view.getUint32(position + 20, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const localOffset = view.getUint32(position + 42, true);
    const name = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    if (method !== 0) throw new Error("Questo .zip è compresso: usa il file creato dall'app, senza modificarlo.");
    const crc = view.getUint32(position + 16, true);
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Archivio .zip danneggiato.");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    if (start + size > bytes.length) throw new Error("Archivio .zip incompleto: il file è stato troncato.");
    const data = bytes.slice(start, start + size);
    if (crc32(data) !== crc) throw new Error(`Archivio .zip danneggiato (${name}).`);
    entries.push({ name, data });
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function entryText(entries: ZipEntry[], name: string): string | null {
  const entry = entries.find((item) => item.name === name);
  return entry ? decoder.decode(entry.data) : null;
}
