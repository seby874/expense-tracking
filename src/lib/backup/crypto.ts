/*
 * Cifratura facoltativa del backup con una password (Web Crypto del browser, nessuna libreria esterna).
 *
 * Formato del file .etbackup (documentato anche in LEGGIMI.md e nel README):
 *   byte 0-7    "ETBACKUP" (ASCII)
 *   byte 8      versione del formato (1)
 *   byte 9-12   iterazioni PBKDF2 (uint32, big endian)
 *   byte 13-28  sale (16 byte casuali)
 *   byte 29-40  vettore iniziale AES-GCM (12 byte casuali)
 *   byte 41-…   archivio .zip cifrato con AES-256-GCM (il tag di autenticazione è in coda)
 * Chiave: PBKDF2-SHA-256(password in UTF-8, sale, iterazioni) → 256 bit.
 */

const MAGIC = new TextEncoder().encode("ETBACKUP");
const FORMAT = 1;
const ITERATIONS = 600_000;
const HEADER = 8 + 1 + 4 + 16 + 12;
export const ENCRYPTED_EXTENSION = ".etbackup";

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export function isEncrypted(bytes: Uint8Array) {
  return bytes.length > HEADER && MAGIC.every((byte, index) => bytes[index] === byte);
}

export async function encryptBackup(data: Uint8Array, password: string, iterations = ITERATIONS): Promise<Uint8Array> {
  if (!password) throw new Error("Imposta una password per cifrare il backup.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource));
  const out = new Uint8Array(HEADER + cipher.length);
  out.set(MAGIC, 0);
  out[8] = FORMAT;
  new DataView(out.buffer).setUint32(9, iterations, false);
  out.set(salt, 13);
  out.set(iv, 29);
  out.set(cipher, HEADER);
  return out;
}

export async function decryptBackup(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (!isEncrypted(bytes)) throw new Error("Il file non è un backup cifrato.");
  if (bytes[8] !== FORMAT) throw new Error("Versione del backup cifrato non supportata.");
  const iterations = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(9, false);
  // Un file manomesso con troppe iterazioni bloccherebbe la scheda.
  if (iterations < 1_000 || iterations > 5_000_000) throw new Error("File di backup non valido.");
  const salt = bytes.slice(13, 29);
  const iv = bytes.slice(29, 41);
  const key = await deriveKey(password, salt, iterations);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, bytes.slice(HEADER) as BufferSource));
  } catch {
    throw new Error("Password errata oppure file danneggiato.");
  }
}
