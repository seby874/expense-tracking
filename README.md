# Expense Tracking

App personale in italiano per registrare entrate, spese, trasferimenti, saldi dei conti e patrimonio netto. Interfaccia React + Vite, dati su Cloud Firestore, accesso con Firebase Authentication (email e password).

## Funzioni

- Panoramica, movimenti, conti e patrimonio, analisi, esportazione CSV, dati di esempio.
- Accesso con email e password, con **Password dimenticata?** (email di ripristino).
- Pagina interna per scegliere la nuova password, se nei modelli email di Firebase imposti l’URL dell’app come URL di azione.
- **Disconnessione automatica per inattività**, da 5 minuti a 1 ora oppure disattivata (Impostazioni → Sicurezza e sessione). Prima dell’uscita compare un avviso; la scelta vale per il singolo browser.
- Pulsante **Cambia password** in Impostazioni.

## Struttura

```
src/
  main.tsx              avvio, stato di accesso, logout per inattività
  app/auth-screens.tsx  accesso, password dimenticata, nuova password
  app/session-guard.tsx timer di inattività e avviso
  app/ledger-*.tsx      interfaccia dell'app
  lib/config.ts         nome dell'app e opzioni (reset password, minuti di inattività)
  lib/firebase.ts       configurazione Firebase
  lib/local-ledger.ts   lettura e scrittura su Firestore (sincronizzazione incrementale)
  lib/ledger-sync.ts    copia in memoria dell'archivio e cursore delle modifiche
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

1. Pubblica `firestore.rules` (Firestore Database → Regole). Quando aggiorni l'app, pubblica prima le regole e subito dopo la cartella `docs/`.
2. Aggiungi `TUO-UTENTE.github.io` ai domini autorizzati (Authentication → Impostazioni).
3. Disattiva la registrazione di nuovi utenti e lascia attiva la protezione dall’enumerazione delle email.
4. Limita la chiave API ai referrer del sito (Google Cloud Console → Credenziali).

Il codice pubblicato è visibile a tutti: la configurazione Firebase in `src/lib/firebase.ts` non è un segreto, la protezione dei dati è data dalle regole Firestore e dalle restrizioni della chiave.

## Letture Firestore e limiti gratuiti

Il piano gratuito concede 50.000 letture, 20.000 scritture e 20.000 eliminazioni al giorno. L'app legge così:

- **Prima apertura su un dispositivo** (o dopo aver cancellato i dati del sito): legge tutto l'archivio una volta.
- **Aperture successive, nuovo accesso dopo il logout, ritorno sulla scheda**: legge solo i documenti cambiati, con un minimo di 1 lettura. Il controllo al ritorno sulla scheda avviene al massimo una volta al minuto.
- **Ogni 30 giorni** rilegge tutto per sicurezza.
- **Ogni salvataggio o eliminazione**: 1 lettura e 1 scrittura.

I documenti scaricati restano nella cache del browser (IndexedDB) anche dopo il logout. Le eliminazioni sono salvate come "lapidi" (`deleted: true`), così gli altri dispositivi le ricevono con la lettura incrementale.

**Non cancellare documenti a mano dalla console Firebase**: i dispositivi che li hanno in cache non se ne accorgerebbero fino alla rilettura completa. Se lo fai, su quei dispositivi cancella i dati del sito dal browser.

Alla prima apertura dopo l'aggiornamento alla 1.1.1, l'app aggiunge `updatedAt` ai documenti salvati dalle versioni precedenti (una scrittura per documento, una volta sola).

## GitHub Pages

La build separa le librerie (`firebase-*.js`, `react-*.js`, `vendor-*.js`) dal codice dell'app (`index-*.js`). Finché non aggiorni le dipendenze, quei file restano identici: a ogni pubblicazione cambia solo il file dell'app, il browser riscarica pochi KB e il repository cresce di poco. Quando carichi la cartella `docs/`, cancella i vecchi file `index-*.js` non più usati e fai un unico commit: ogni commit su main avvia una pubblicazione di Pages (limite indicativo: 10 all'ora).
