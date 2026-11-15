/**
 * Blocco con impronta (o PIN/volto del dispositivo) tramite WebAuthn.
 *
 * È un blocco locale, come quello delle app bancarie: dopo l'inattività l'app nasconde i dati e chiede
 * lo sblocco del dispositivo invece della password. La sessione Firebase resta attiva; dopo
 * LOCK_MAX_HOURS ore di blocco si esce del tutto. Non sostituisce la password: protegge da chi prende in
 * mano il dispositivo, non da chi ha accesso tecnico al browser.
 */

const KEY = "et-lock";
export const LOCK_MAX_HOURS = 12;

type LockConfig = { id: string };

function encode(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(text: string) {
  const base = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function random(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function lockConfig(): LockConfig | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as LockConfig | null;
    return saved && typeof saved.id === "string" ? saved : null;
  } catch {
    return null;
  }
}

export function lockEnabled() {
  return !!lockConfig();
}

/** true se il dispositivo ha un lettore di impronte / sblocco con PIN utilizzabile dal browser. */
export async function lockAvailable() {
  try {
    return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function enableLock(email: string) {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { name: "Expense Tracking", id: window.location.hostname },
      user: { id: random(16), name: email || "utente", displayName: email || "Expense Tracking" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60_000,
      attestation: "none",
    },
  }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Attivazione annullata.");
  window.localStorage.setItem(KEY, JSON.stringify({ id: encode(credential.rawId) }));
}

export function disableLock() {
  try { window.localStorage.removeItem(KEY); } catch {}
}

/** Chiede impronta o PIN del dispositivo. true se lo sblocco è riuscito. */
export async function unlockWithDevice() {
  const config = lockConfig();
  if (!config) return false;
  try {
    const result = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: "public-key", id: decode(config.id) }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return !!result;
  } catch {
    return false;
  }
}
