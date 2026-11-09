import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  applyActionCode, checkActionCode, confirmPasswordReset, signInWithEmailAndPassword, verifyPasswordResetCode,
} from "firebase/auth";
import { ArrowLeft, CircleAlert, CircleCheck, Eye, EyeOff, Info, LockKeyhole, MailCheck } from "lucide-react";
import { auth } from "../lib/firebase";
import { MIN_PASSWORD_LENGTH, PASSWORD_RESET_ENABLED } from "../lib/config";
import { markActivity } from "../lib/session";
import {
  actionError, errorCode, loginError, requestPasswordReset, resetRequestError,
} from "../lib/auth-actions";
import { BrandName, Mark } from "./brand";

export type AuthNotice = { tone: "info" | "success"; text: string };
export type ActionMode = "resetPassword" | "verifyEmail" | "recoverEmail";
type Screen = "login" | "forgot";

function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return <div className="auth-shell">
    <main className="auth-card">
      <div className="auth-brand"><Mark /><BrandName className="auth-brand-name" /></div>
      <h1>{title}</h1>
      {subtitle && <p className="auth-subtitle">{subtitle}</p>}
      {children}
    </main>
    <p className="auth-footnote"><LockKeyhole size={13} /> Accesso riservato · connessione protetta</p>
  </div>;
}

function Notice({ notice }: { notice: AuthNotice | null }) {
  if (!notice) return null;
  const Icon = notice.tone === "success" ? CircleCheck : Info;
  return <p className={`auth-notice auth-notice-${notice.tone}`} role="status"><Icon size={17} /><span>{notice.text}</span></p>;
}

function ErrorText({ message }: { message: string }) {
  return message ? <p className="form-error" role="alert"><CircleAlert size={15} /> {message}</p> : null;
}

function PasswordField({ label, name, autoComplete, minLength }: {
  label: string; name: string; autoComplete: string; minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return <label>{label}
    <span className="password-field">
      <input type={visible ? "text" : "password"} name={name} autoComplete={autoComplete} minLength={minLength} required />
      <button type="button" className="password-toggle" aria-label={visible ? "Nascondi password" : "Mostra password"}
        aria-pressed={visible} onClick={() => setVisible((value) => !value)}>
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  </label>;
}

export function Splash() {
  return <div className="auth-shell"><p className="splash" role="status"><Mark /> Verifica dell’accesso…</p></div>;
}

export function LoginScreen({ notice, onForgot }: { notice: AuthNotice | null; onForgot: (email: string) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const email = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const fields = new FormData(event.currentTarget);
    try {
      // Segna l'attività prima dell'accesso, così il controllo di inattività parte da adesso.
      markActivity();
      await signInWithEmailAndPassword(auth, String(fields.get("email")).trim(), String(fields.get("password")));
    } catch (failure) {
      setError(loginError(errorCode(failure)));
      setBusy(false);
    }
  }

  return <AuthLayout title="Bentornato" subtitle="Accedi per aprire il tuo archivio personale.">
    <Notice notice={notice} />
    <form className="editor auth-form" onSubmit={submit}>
      <label>Email<input ref={email} type="email" name="email" autoComplete="username" required autoFocus /></label>
      <PasswordField label="Password" name="password" autoComplete="current-password" />
      {PASSWORD_RESET_ENABLED && <button type="button" className="text-button forgot-link"
        onClick={() => onForgot(email.current?.value.trim() ?? "")}>Password dimenticata?</button>}
      <ErrorText message={error} />
      <button type="submit" className="button primary auth-submit" disabled={busy}>
        {busy ? "Accesso in corso…" : "Accedi"}
      </button>
    </form>
  </AuthLayout>;
}

const RESEND_SECONDS = 30;

export function ForgotPasswordScreen({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function send(email: string) {
    setError("");
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSentTo(email);
      setCooldown(RESEND_SECONDS);
    } catch (failure) {
      const code = errorCode(failure);
      // Con la protezione dall'enumerazione attiva Firebase non rivela se l'email esiste:
      // anche qui il messaggio resta lo stesso.
      if (code === "auth/user-not-found") {
        setSentTo(email);
        setCooldown(RESEND_SECONDS);
      } else {
        setError(resetRequestError(code));
      }
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(String(new FormData(event.currentTarget).get("email")).trim());
  }

  if (sentTo) {
    return <AuthLayout title="Controlla la posta">
      <div className="auth-sent">
        <span className="auth-sent-icon"><MailCheck size={24} /></span>
        <p>Se esiste un account per <strong>{sentTo}</strong>, riceverai a breve un’email con il link per scegliere una nuova password.</p>
        <p className="form-help">Non la trovi? Controlla lo spam. Il link ha una durata limitata, usalo il prima possibile.</p>
      </div>
      <ErrorText message={error} />
      <div className="auth-actions">
        <button type="button" className="button secondary" disabled={busy || cooldown > 0} onClick={() => void send(sentTo)}>
          {busy ? "Invio…" : cooldown > 0 ? `Invia di nuovo (${cooldown}s)` : "Invia di nuovo"}
        </button>
        <button type="button" className="button primary" onClick={onBack}>Torna all’accesso</button>
      </div>
    </AuthLayout>;
  }

  return <AuthLayout title="Password dimenticata" subtitle="Inserisci l’email del tuo account: ti invieremo un link per impostarne una nuova.">
    <form className="editor auth-form" onSubmit={submit}>
      <label>Email<input type="email" name="email" autoComplete="username" defaultValue={initialEmail} required autoFocus /></label>
      <ErrorText message={error} />
      <button type="submit" className="button primary auth-submit" disabled={busy}>{busy ? "Invio…" : "Invia link di ripristino"}</button>
      <button type="button" className="text-button back-link" onClick={onBack}><ArrowLeft size={15} /> Torna all’accesso</button>
    </form>
  </AuthLayout>;
}

/** Gestisce i link delle email Firebase (?mode=...&oobCode=...) quando puntano a questa app. */
export function ActionScreen({ mode, oobCode, onDone }: {
  mode: ActionMode; oobCode: string; onDone: (notice: AuthNotice | null, screen: Screen) => void;
}) {
  const [state, setState] = useState<{ step: "checking" } | { step: "form"; email: string } | { step: "done"; text: string } | { step: "error"; text: string; network: boolean }>({ step: "checking" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function run() {
      try {
        if (mode === "resetPassword") {
          const email = await verifyPasswordResetCode(auth, oobCode);
          if (active) setState({ step: "form", email });
        } else if (mode === "verifyEmail") {
          await applyActionCode(auth, oobCode);
          if (active) setState({ step: "done", text: "Indirizzo email verificato. Ora puoi accedere." });
        } else {
          const info = await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          if (active) setState({ step: "done", text: `L’indirizzo email dell’account è tornato a ${info.data.email ?? "quello precedente"}. Per sicurezza reimposta anche la password.` });
        }
      } catch (failure) {
        const code = errorCode(failure);
        if (active) setState({ step: "error", text: actionError(code), network: code === "auth/network-request-failed" });
      }
    }
    void run();
    return () => { active = false; };
  }, [mode, oobCode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.step !== "form") return;
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get("password"));
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Usa almeno ${MIN_PASSWORD_LENGTH} caratteri.`);
      return;
    }
    if (password !== String(fields.get("confirm"))) {
      setError("Le due password non coincidono.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
    } catch (failure) {
      setError(actionError(errorCode(failure)));
      setBusy(false);
      return;
    }
    try {
      markActivity();
      await signInWithEmailAndPassword(auth, state.email, password);
      onDone({ tone: "success", text: "Password aggiornata." }, "login");
    } catch {
      onDone({ tone: "success", text: "Password aggiornata. Accedi con la nuova password." }, "login");
    }
  }

  if (state.step === "checking") {
    return <AuthLayout title="Un momento…"><p className="form-help" role="status">Verifica del link in corso…</p></AuthLayout>;
  }
  if (state.step === "error") {
    return <AuthLayout title={state.network ? "Verifica non riuscita" : "Link non valido"}>
      <ErrorText message={state.text} />
      <div className="auth-actions">
        {PASSWORD_RESET_ENABLED && mode === "resetPassword" && <button type="button" className="button secondary" onClick={() => onDone(null, "forgot")}>Richiedi un nuovo link</button>}
        <button type="button" className="button primary" onClick={() => onDone(null, "login")}>Vai all’accesso</button>
      </div>
    </AuthLayout>;
  }
  if (state.step === "done") {
    return <AuthLayout title="Fatto">
      <Notice notice={{ tone: "success", text: state.text }} />
      <div className="auth-actions"><button type="button" className="button primary" onClick={() => onDone(null, "login")}>Continua</button></div>
    </AuthLayout>;
  }
  return <AuthLayout title="Nuova password" subtitle={<>Account: <strong>{state.email}</strong></>}>
    <form className="editor auth-form" onSubmit={submit}>
      <input type="email" name="username" autoComplete="username" value={state.email} readOnly hidden />
      <PasswordField label="Nuova password" name="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
      <PasswordField label="Ripeti la password" name="confirm" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
      <p className="form-help">Almeno {MIN_PASSWORD_LENGTH} caratteri. Meglio se lunga e unica, non usata su altri siti.</p>
      <ErrorText message={error} />
      <button type="submit" className="button primary auth-submit" disabled={busy}>{busy ? "Salvataggio…" : "Salva nuova password"}</button>
    </form>
  </AuthLayout>;
}
