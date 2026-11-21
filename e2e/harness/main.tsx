// Solo per i test dell'interfaccia: l'app senza accesso, con l'archivio simulato (vedi vite.config.ts).
import { createRoot } from "react-dom/client";
import { startAppearance } from "../../src/lib/theme-runtime";
import { LedgerApp } from "../../src/app/ledger-app";
import "@fontsource-variable/inter";
import "../../src/app/globals.css";
import "../../src/app/globals-dark.css";
import "../../src/app/globals-features.css";
import "../../src/app/layout-2-1.css";
import "../../src/app/theme.css";

startAppearance();
createRoot(document.getElementById("root")!).render(<LedgerApp session={{
  email: "prova@example.com", idleMinutes: 60, onIdleChange: () => undefined,
  onLogout: () => undefined, onPasswordEmail: async () => undefined,
}} />);
