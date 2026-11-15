import { useEffect, useState } from "react";
import { Fingerprint, KeyRound, Lock } from "lucide-react";
import { LOCK_MAX_HOURS, unlockWithDevice } from "../lib/lock";
import { lastActivity } from "../lib/session";

/** Schermata di blocco: i dati restano nascosti finché non sblocchi con impronta o PIN del dispositivo. */
export function LockScreen({ email, onUnlock, onPassword }: { email: string; onUnlock: () => void; onPassword: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Dopo troppe ore di blocco si esce del tutto e serve la password.
    const last = lastActivity();
    if (last === null || Date.now() - last > LOCK_MAX_HOURS * 3_600_000) onPassword();
  }, [onPassword]);

  async function unlock() {
    setBusy(true);
    setError("");
    const ok = await unlockWithDevice();
    setBusy(false);
    if (ok) onUnlock();
    else setError("Sblocco non riuscito. Riprova oppure accedi con la password.");
  }

  return <main className="lock-screen">
    <section className="lock-card" aria-labelledby="lock-title">
      <span className="lock-badge"><Lock size={22} /></span>
      <h1 id="lock-title">Expense Tracking è bloccata</h1>
      <p>Per sicurezza l’app si è bloccata dopo un periodo di inattività.{email && <><br /><small>{email}</small></>}</p>
      <button type="button" className="button primary lock-button" disabled={busy} onClick={() => void unlock()} autoFocus>
        <Fingerprint size={20} /> {busy ? "In attesa…" : "Sblocca"}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="button" className="text-button" onClick={onPassword}><KeyRound size={15} /> Usa la password</button>
    </section>
  </main>;
}
