import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "./firebase";
import { MIN_PASSWORD_LENGTH } from "./config";

export function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

/** Indirizzo dell'app, usato come pulsante "Continua" dopo il ripristino. */
export function appUrl() {
  return window.location.origin + window.location.pathname;
}

/**
 * Invia l'email di ripristino. Se il dominio dell'app non è ancora tra i
 * "domini autorizzati" di Firebase, ripiega sull'email senza link di ritorno.
 */
export async function requestPasswordReset(email: string) {
  try {
    await sendPasswordResetEmail(auth, email, { url: appUrl() });
  } catch (error) {
    const code = errorCode(error);
    if (code === "auth/unauthorized-continue-uri" || code === "auth/invalid-continue-uri" || code === "auth/missing-continue-uri") {
      await sendPasswordResetEmail(auth, email);
      return;
    }
    throw error;
  }
}

export function loginError(code: string) {
  switch (code) {
    case "auth/too-many-requests": return "Troppi tentativi non riusciti. Attendi qualche minuto oppure reimposta la password.";
    case "auth/network-request-failed": return "Connessione assente. Controlla la rete e riprova.";
    case "auth/user-disabled": return "Questo account è stato disattivato.";
    default: return "Email o password non corretti.";
  }
}

export function resetRequestError(code: string) {
  switch (code) {
    case "auth/invalid-email": return "L’indirizzo email non è valido.";
    case "auth/too-many-requests": return "Hai richiesto troppe email in poco tempo. Riprova tra qualche minuto.";
    case "auth/network-request-failed": return "Connessione assente. Controlla la rete e riprova.";
    default: return "Invio non riuscito. Riprova più tardi.";
  }
}

export function actionError(code: string) {
  switch (code) {
    case "auth/expired-action-code": return "Il link è scaduto. Richiedi una nuova email.";
    case "auth/invalid-action-code": return "Il link non è valido oppure è già stato usato.";
    case "auth/user-disabled": return "Questo account è stato disattivato.";
    case "auth/user-not-found": return "L’account collegato a questo link non esiste più.";
    case "auth/weak-password": return `La password è troppo debole: usa almeno ${MIN_PASSWORD_LENGTH} caratteri.`;
    case "auth/password-does-not-meet-requirements": return "La password non rispetta i requisiti di sicurezza (lunghezza, maiuscole, numeri o simboli).";
    case "auth/network-request-failed": return "Connessione assente. Controlla la rete e riprova.";
    case "auth/too-many-requests": return "Troppe richieste in poco tempo. Riprova tra qualche minuto.";
    default: return "Operazione non riuscita. Riprova.";
  }
}
