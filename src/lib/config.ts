// Impostazioni generali dell'app. Modifica qui nome e funzioni opzionali.

export const APP_NAME = "Expense Tracking";

// Mostra il link "Password dimenticata?" nella schermata di accesso.
export const PASSWORD_RESET_ENABLED = true;

// Disconnessione automatica per inattività (minuti). 0 = disattivata.
export const IDLE_OPTIONS = [0, 5, 10, 15, 30, 60] as const;
export const DEFAULT_IDLE_MINUTES = 15;
// Secondi di preavviso prima della disconnessione.
export const IDLE_WARNING_SECONDS = 60;

// Lunghezza minima richiesta quando si imposta una nuova password.
export const MIN_PASSWORD_LENGTH = 8;
