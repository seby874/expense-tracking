import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
import { IDLE_WARNING_SECONDS } from "../lib/config";
import { idleLabel, idleRemaining, markActivity } from "../lib/session";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
// L'ultima attività viene salvata al massimo ogni 5 secondi (ed è condivisa tra le schede aperte).
const WRITE_EVERY_MS = 5_000;

export function expiredMessage(minutes: number) {
  return `Per sicurezza sei stato disconnesso dopo ${idleLabel(minutes)} di inattività.`;
}

/**
 * Disconnette l'utente dopo `minutes` minuti senza interazioni (0 = disattivato).
 * Restituisce i secondi rimanenti quando è il momento di mostrare l'avviso.
 */
export function useIdleLogout(minutes: number, onExpire: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastWrite = useRef(0);
  const expired = useRef(false);
  const expireRef = useRef(onExpire);
  useEffect(() => { expireRef.current = onExpire; });

  const touch = useCallback(() => {
    const now = Date.now();
    if (now - lastWrite.current < WRITE_EVERY_MS) return;
    lastWrite.current = now;
    markActivity(now);
  }, []);

  const stay = useCallback(() => {
    lastWrite.current = 0;
    touch();
    setSecondsLeft(null);
  }, [touch]);

  useEffect(() => {
    if (!minutes) {
      setSecondsLeft(null);
      return;
    }
    expired.current = false;
    lastWrite.current = 0;
    touch();

    const warnMs = Math.min(IDLE_WARNING_SECONDS * 1000, (minutes * 60_000) / 2);
    const check = () => {
      if (expired.current) return;
      const remaining = idleRemaining(minutes);
      if (remaining === null) return;
      if (remaining <= 0) {
        expired.current = true;
        setSecondsLeft(null);
        expireRef.current();
        return;
      }
      setSecondsLeft(remaining <= warnMs ? Math.ceil(remaining / 1000) : null);
    };

    const options = { passive: true, capture: true } as const;
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, touch, options);
    // Al ritorno da standby o da un'altra scheda il controllo è immediato.
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, 1000);
    check();

    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, touch, options);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
  }, [minutes, touch]);

  return { secondsLeft, stay };
}

export function IdleWarning({ seconds, onStay }: { seconds: number; onStay: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // <dialog> modale: resta sopra anche alle finestre di modifica già aperte.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="idle-dialog" role="alertdialog" aria-labelledby="idle-title" aria-describedby="idle-text"
    onCancel={(event) => { event.preventDefault(); onStay(); }}>
    <span className="idle-icon"><Clock3 size={22} /></span>
    <h2 id="idle-title">Sei ancora qui?</h2>
    <p id="idle-text">Per sicurezza verrai disconnesso tra <strong>{seconds} {seconds === 1 ? "secondo" : "secondi"}</strong>.</p>
    <button type="button" className="button primary" onClick={onStay}>Resta connesso</button>
  </dialog>;
}
