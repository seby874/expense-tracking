# Expense Tracking

App personale in italiano per registrare entrate, spese, trasferimenti, saldi dei conti e patrimonio netto. Interfaccia React + Vite, dati su Cloud Firestore, accesso con Firebase Authentication (email e password).

## Funzioni

- Panoramica, movimenti, patrimonio, analisi, esportazione CSV, dati di esempio.
- **Patrimonio** in tre schede: **Conti** (liquidità e altri beni), **Investimenti** e **Debiti**.
- **Investimenti**: valore aggiornato a mano («Aggiorna valore»), versamenti come trasferimenti da un conto («Versa»), versato, rendimento, composizione per tipo.
- **Debiti**: finanziamenti a rata fissa (anche a tasso zero, come i micro-finanziamenti) e debiti flessibili (amici e parenti). Nella scheda del finanziamento, TAN, TAEG, spese per rata e una spiegazione con i calcoli del piano alla francese.
- **Importazione degli estratti conto** (Revolut CSV, Fineco PDF, CSV di altre banche con colonne riconosciute da sole): conto, data, importo, tipo, categoria e sottocategoria proposti in un'anteprima da controllare. Riconosce trasferimenti tra i tuoi conti (anche dalle carte usate per le ricariche), prelievi, rimborsi e storni, rate dei finanziamenti e righe già importate; aggiorna i saldi di fine mese dal file. Le correzioni diventano **regole** per le volte successive (Impostazioni → Regole d’importazione) e ogni importazione si può **annullare**. I file vengono letti solo nel browser.
- **Tag liberi** sui movimenti (es. un viaggio), con filtro, totale e riepilogo per tag in Analisi.
- **Spesa divisa** tra più categorie, anche con una parte anticipata per qualcuno (va al suo credito).
- **Crediti** in Patrimonio: soldi prestati o anticipati, con restituzioni.
- **Inserimento veloce** dal telefono (pulsante + e scorciatoie «Nuova spesa» / «Nuova entrata» sull’icona dell’app installata).
- Movimento **Rata**: dal conto esce la rata intera, il debito scende solo del capitale, interessi e spese contano come spesa (categoria «Interessi»). La divisione si calcola da sola dal residuo e si può correggere a mano. Le rate possono essere proposte ogni mese (automatico) oppure registrate o corrette a mano.
- Accesso con email e password, con **Password dimenticata?** (email di ripristino).
- Pagina interna per scegliere la nuova password, se nei modelli email di Firebase imposti l’URL dell’app come URL di azione.
- **Disconnessione automatica per inattività**, da 5 minuti a 1 ora oppure disattivata (Impostazioni → Sicurezza e sessione). Prima dell’uscita compare un avviso; la scelta vale per il singolo browser.
- Pulsante **Cambia password** in Impostazioni.
- **Conti, categorie e fonti**: modifica, archiviazione (spariscono dai menu, lo storico resta) ed eliminazione. Se ci sono movimenti collegati si può archiviare oppure spostarli su un’altra voce prima di eliminare.
- **Sottocategorie di spesa** gestite per ogni categoria (aggiungi, rinomina, elimina, riordina); le rinomine si applicano anche ai movimenti già salvati.
- **Movimenti ricorrenti** (settimanali, mensili, annuali, ogni N periodi, con data di fine facoltativa): le scadenze arrivate vengono proposte da registrare, modificare o saltare.
- **Importazione** dei CSV esportati dall’app (movimenti o saldi), con anteprima e riconoscimento dei doppioni, e **backup completo** in JSON da scaricare e ripristinare.
- **Tema** automatico, chiaro o scuro.
- **Uso offline** facoltativo per dispositivo: copia locale dei dati, scritture in coda senza rete, apertura della pagina tramite service worker; la copia locale si cancella all’uscita.

## Struttura

```
src/
  main.tsx              avvio, stato di accesso, logout per inattività
  app/auth-screens.tsx  accesso, password dimenticata, nuova password
  app/session-guard.tsx timer di inattività e avviso
  app/ledger-*.tsx      interfaccia dell'app
  app/patrimonio.tsx    schede Conti, Investimenti e Debiti
  app/patrimonio-forms.tsx  schede di inserimento di investimenti e debiti (con spiegazione TAN/TAEG)
  app/manage.tsx        modifica, archiviazione ed eliminazione di conti e categorie
  app/recurring.tsx     scadenze e elenco dei movimenti ricorrenti
  app/import-dialog.tsx importazione CSV e ripristino backup
  lib/recurring.ts      calcolo delle scadenze
  lib/debts.ts          piano di ammortamento, divisione capitale/interessi, stato dei debiti
  lib/bank/             lettura degli estratti conto (statements, pdf-lines), pulizia delle descrizioni (text), classificazione e regole (classify)
  app/bank-import.tsx   anteprima dell’importazione degli estratti conto
  app/quick-entry.tsx   inserimento veloce
  app/settings-extra.tsx  regole, importazioni e tag in Impostazioni
  lib/investments.ts    valore, versato e rendimento degli investimenti
  lib/data-io.ts        esportazione, lettura CSV, piano d'importazione, backup
  lib/preferences.ts    tema e uso offline (per dispositivo)
  lib/offline-shell.ts  registrazione del service worker (public/sw.js)
  lib/config.ts         nome dell'app e opzioni (reset password, minuti di inattività)
  lib/firebase.ts       configurazione Firebase
  lib/local-ledger.ts   lettura e scrittura su Firestore
firestore.rules         regole di sicurezza da pubblicare nella console Firebase
docs/                   build pronta per GitHub Pages
```

## Sviluppo

Serve Node.js 22.12+ (o 24).

```sh
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # rigenera la cartella docs/
```

Dopo ogni modifica esegui `npm run build` e carica anche la cartella `docs/` aggiornata. Il file `docs/.nojekyll` viene ricreato in automatico dalla build.

## Pubblicazione

GitHub Pages: **Settings → Pages → Deploy from a branch → main → /docs**.

Prima di usare l’app online, nella console Firebase:

1. Pubblica `firestore.rules` (Firestore Database → Regole).
2. Aggiungi `TUO-UTENTE.github.io` ai domini autorizzati (Authentication → Impostazioni).
3. Disattiva la registrazione di nuovi utenti e lascia attiva la protezione dall’enumerazione delle email.
4. Limita la chiave API ai referrer del sito (Google Cloud Console → Credenziali).

Il codice pubblicato è visibile a tutti: la configurazione Firebase in `src/lib/firebase.ts` non è un segreto, la protezione dei dati è data dalle regole Firestore e dalle restrizioni della chiave.
