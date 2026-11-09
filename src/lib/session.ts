import { DEFAULT_IDLE_MINUTES, IDLE_OPTIONS } from "./config";

// Le preferenze di sessione valgono per questo browser/dispositivo.
const MINUTES_KEY = "et-idle-minutes";
const ACTIVITY_KEY = "et-last-activity";

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readIdleMinutes(): number {
  const raw = storage()?.getItem(MINUTES_KEY);
  if (raw === null || raw === undefined) return DEFAULT_IDLE_MINUTES;
  const value = Number(raw);
  return (IDLE_OPTIONS as readonly number[]).includes(value) ? value : DEFAULT_IDLE_MINUTES;
}

export function saveIdleMinutes(minutes: number) {
  try { storage()?.setItem(MINUTES_KEY, String(minutes)); } catch {}
}

export function markActivity(now = Date.now()) {
  try { storage()?.setItem(ACTIVITY_KEY, String(now)); } catch {}
}

export function lastActivity(): number | null {
  const value = Number(storage()?.getItem(ACTIVITY_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Millisecondi rimanenti prima della disconnessione, oppure null se disattivata. */
export function idleRemaining(minutes: number, now = Date.now()): number | null {
  if (!minutes) return null;
  const last = lastActivity();
  if (last === null) return minutes * 60_000;
  return minutes * 60_000 - (now - last);
}

export function isIdleExpired(minutes: number, now = Date.now()) {
  const remaining = idleRemaining(minutes, now);
  return remaining !== null && remaining <= 0;
}

export function idleLabel(minutes: number) {
  if (!minutes) return "Disattivata";
  if (minutes === 60) return "1 ora";
  return `${minutes} minuti`;
}
