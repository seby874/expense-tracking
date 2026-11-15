import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth, offlineEnabled } from "./lib/firebase";
import { flushPending } from "./lib/local-ledger";
import { applyLook, applyTheme, readLook, readTheme, requestCacheClear, setNoticeAfterReload, takeNoticeAfterReload } from "./lib/preferences";
import { setupOfflineShell } from "./lib/offline-shell";
import { APP_NAME } from "./lib/config";
import { isIdleExpired, lastActivity, markActivity, readIdleMinutes, saveIdleMinutes } from "./lib/session";
import { LOCK_MAX_HOURS, lockEnabled } from "./lib/lock";
import { LockScreen } from "./app/lock-screen";
import { requestPasswordReset } from "./lib/auth-actions";
import { LedgerApp } from "./app/ledger-app";
import {
  ActionScreen, ForgotPasswordScreen, LoginScreen, Splash, type ActionMode, type AuthNotice,
} from "./app/auth-screens";
import { IdleWarning, expiredMessage, useIdleLogout } from "./app/session-guard";
import "./app/globals.css";

const ACTION_MODES: ActionMode[] = ["resetPassword", "verifyEmail", "recoverEmail"];

/** Legge un eventuale link delle email Firebase e lo toglie subito dalla barra degli indirizzi. */
function readEmailAction() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") as ActionMode | null;
  const oobCode = params.get("oobCode");
  if (!mode || !oobCode || !ACTION_MODES.includes(mode)) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  return { mode, oobCode };
}

const initialAction = readEmailAction();
const initialNotice = takeNoticeAfterReload();

applyTheme(readTheme());
applyLook(readLook());
setupOfflineShell(offlineEnabled);

/** Il blocco con impronta può sostituire il logout per inattività, entro LOCK_MAX_HOURS ore. */
function canLock() {
  const last = lastActivity();
  return lockEnabled() && last !== null && Date.now() - last < LOCK_MAX_HOURS * 3_600_000;
}

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [locked, setLocked] = useState(false);
  const [action, setAction] = useState(initialAction);
  const [screen, setScreen] = useState<"login" | "forgot">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [notice, setNotice] = useState<AuthNotice | null>(initialNotice ? { tone: "info", text: initialNotice } : null);
  const [idleMinutes, setIdleMinutes] = useState(readIdleMinutes);

  useEffect(() => onAuthStateChanged(auth, (next) => {
    // Sessione ripristinata dopo troppo tempo (scheda chiusa, PC in standby): si esce subito.
    const minutes = readIdleMinutes();
    if (next && isIdleExpired(minutes) && canLock()) {
      setLocked(true);
      setUser(next);
      return;
    }
    if (next && isIdleExpired(minutes)) {
      setNotice({ tone: "info", text: expiredMessage(minutes) });
      signOut(auth).catch(() => setUser(null));
      return;
    }
    if (next) setNotice(null);
    setUser(next);
  }), []);

  const logout = useCallback(async (reason?: AuthNotice) => {
    if (offlineEnabled) {
      // Con l'uso offline la copia locale si cancella quando premi "Esci", ma solo se tutto è già
      // sincronizzato. Dopo la disconnessione per inattività invece resta: per vedere i dati serve
      // comunque accedere, e al nuovo accesso si scaricano solo le modifiche invece dell'intero archivio.
      const synced = await flushPending(3000);
      if (!synced && !reason && !window.confirm("Alcune modifiche non sono ancora arrivate sul cloud perché sei offline.\n\nSe esci ora restano su questo dispositivo e si sincronizzeranno al prossimo accesso. Vuoi uscire?")) {
        return;
      }
      if (synced && !reason) requestCacheClear();
      if (reason) setNoticeAfterReload(reason.text);
      try { await signOut(auth); } finally { window.location.reload(); }
      return;
    }
    setNotice(reason ?? null);
    setScreen("login");
    try {
      await signOut(auth);
    } catch {
      setNotice({ tone: "info", text: "Uscita non riuscita. Ricarica la pagina e riprova." });
    }
  }, []);

  const idle = useIdleLogout(user && !locked ? idleMinutes : 0, () => {
    if (canLock()) { setLocked(true); return; }
    void logout({ tone: "info", text: expiredMessage(idleMinutes) });
  });

  const unlock = useCallback(() => { markActivity(); setLocked(false); }, []);
  const passwordInstead = useCallback(() => {
    setLocked(false);
    void logout({ tone: "info", text: expiredMessage(readIdleMinutes()) });
  }, [logout]);

  function changeIdle(minutes: number) {
    saveIdleMinutes(minutes);
    setIdleMinutes(minutes);
  }

  if (action) {
    return <ActionScreen {...action} onDone={(result, next) => {
      setAction(null);
      setNotice(result);
      setScreen(next);
    }} />;
  }

  if (user === undefined) return <Splash />;

  if (user && locked) return <LockScreen email={user.email ?? ""} onUnlock={unlock} onPassword={passwordInstead} />;

  if (user) {
    return <>
      <LedgerApp key={user.uid} session={{
        email: user.email ?? "",
        idleMinutes,
        onIdleChange: changeIdle,
        onLogout: () => void logout(),
        onPasswordEmail: () => requestPasswordReset(user.email ?? ""),
      }} />
      {idle.secondsLeft !== null && <IdleWarning seconds={idle.secondsLeft} onStay={idle.stay} />}
    </>;
  }

  if (screen === "forgot") {
    return <ForgotPasswordScreen initialEmail={forgotEmail} onBack={() => setScreen("login")} />;
  }

  return <LoginScreen notice={notice} onForgot={(email) => {
    setForgotEmail(email);
    setNotice(null);
    setScreen("forgot");
  }} />;
}

const root = document.getElementById("root")!;

// Protezione da clickjacking: GitHub Pages non permette di inviare l'header
// X-Frame-Options, quindi l'app si rifiuta di funzionare dentro un iframe.
if (window.top !== window.self) {
  root.innerHTML = "";
  const message = document.createElement("p");
  message.className = "framed-warning";
  message.textContent = `${APP_NAME} può essere usata solo nella propria finestra.`;
  root.appendChild(message);
} else {
  createRoot(root).render(<App />);
}
