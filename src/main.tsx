import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "./lib/firebase";
import { APP_NAME } from "./lib/config";
import { isIdleExpired, readIdleMinutes, saveIdleMinutes } from "./lib/session";
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

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [action, setAction] = useState(initialAction);
  const [screen, setScreen] = useState<"login" | "forgot">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [idleMinutes, setIdleMinutes] = useState(readIdleMinutes);

  useEffect(() => onAuthStateChanged(auth, (next) => {
    // Sessione ripristinata dopo troppo tempo (scheda chiusa, PC in standby): si esce subito.
    const minutes = readIdleMinutes();
    if (next && isIdleExpired(minutes)) {
      setNotice({ tone: "info", text: expiredMessage(minutes) });
      signOut(auth).catch(() => setUser(null));
      return;
    }
    if (next) setNotice(null);
    setUser(next);
  }), []);

  const logout = useCallback(async (reason?: AuthNotice) => {
    setNotice(reason ?? null);
    setScreen("login");
    try {
      await signOut(auth);
    } catch {
      setNotice({ tone: "info", text: "Uscita non riuscita. Ricarica la pagina e riprova." });
    }
  }, []);

  const idle = useIdleLogout(user ? idleMinutes : 0, () => {
    void logout({ tone: "info", text: expiredMessage(idleMinutes) });
  });

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
