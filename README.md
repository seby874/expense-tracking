# Expense Tracking

App personale in italiano per registrare entrate, spese, trasferimenti, saldi dei conti e patrimonio netto. Interfaccia React + Vite, dati su Cloud Firestore, accesso con Firebase Authentication (email e password).

## Funzioni

- Panoramica, movimenti, patrimonio, analisi, esportazione CSV, dati di esempio.
- **Patrimonio** in tre schede: **Conti** (liquidità e altri beni), **Investimenti** e **Debiti**.
- **Investimenti**: valore aggiornato a mano («Aggiorna valore»), versamenti come trasferimenti da un conto («Versa»), versato, rendimento, composizione per tipo.
- **Debiti**: finanziamenti a rata fissa (anche a tasso zero, come i micro-finanziamenti) e debiti flessibili (amici e parenti). Nella scheda del finanziamento, TAN, TAEG, spese per rata e una spiegazione con i calcoli del piano alla francese.
- **Suggerimenti mentre scrivi** la descrizione: i movimenti passati simili compilano categoria, sottocategoria, conto, metodo e tag (solo i campi vuoti).
- **Preferiti**: movimenti modello da registrare con un tocco dall’inserimento veloce (con importo fisso o da scegliere). Si creano spuntando «Salva anche come preferito» o da Impostazioni, dove si riordinano.
- **Calcolatrice** nel campo importo: `12,50+8`, `45/3`, `2x7,5`, con il risultato mostrato sotto.
- **Duplica** un movimento (stessi dati, data di oggi).
- **Riconciliazione dei saldi**: registrando un saldo vedi quello atteso dai movimenti e lo scarto; con un clic una **rettifica** chiude la differenza. In Patrimonio → Conti l’elenco degli scarti degli ultimi mesi.
- **Cestino**: le voci eliminate si ripristinano per 30 giorni; dopo ogni eliminazione (e dopo un inserimento veloce) compare **Annulla**.
- **Modalità discreta**: l’occhio in alto nasconde gli importi (••• €); può partire attiva all’apertura.
- **Personalizzazione** per dispositivo: schermata d’apertura, densità compatta o comoda, testo normale o grande, promemoria.
- **Promemoria** in Panoramica: giorni senza movimenti, saldi di fine mese da registrare, backup da scaricare.
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
- **Backup completo** in JSON da scaricare e **ripristinare**; esportazione di movimenti e saldi in CSV per i fogli di calcolo.
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
  lib/recurring.ts      calcolo delle scadenze
  lib/debts.ts          piano di ammortamento, divisione capitale/interessi, stato dei debiti
  app/quick-entry.tsx   inserimento veloce
  app/settings-extra.tsx  preferiti, cestino, personalizzazione, ripristino del backup e tag in Impostazioni
  app/inputs.tsx        descrizione con suggerimenti e anteprima della calcolatrice
  app/reminders.tsx     promemoria in Panoramica
  lib/investments.ts    valore, versato e rendimento degli investimenti
  lib/data-io.ts        esportazione CSV, backup e ripristino
  lib/preferences.ts    tema, uso offline e personalizzazione (per dispositivo)
  lib/offline-shell.ts  registrazione del service worker (public/sw.js)
  lib/config.ts         nome dell'app e opzioni (reset password, minuti di inattività)
  lib/firebase.ts       configurazione Firebase
  lib/local-ledger.ts   lettura e scrittura su Firestore (solo le modifiche, vedi sotto)
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

Il piano gratuito concede 50.000 letture, 20.000 scritture e 20.000 eliminazioni al giorno.

- Ogni documento salvato ha `updatedAt` (ora del server). L'app chiede al server solo i documenti più recenti dell'ultimo già visto: **minimo 1 lettura** per controllo, anche se non è cambiato nulla.
- **Con "Uso offline" attivo** (Impostazioni → Aspetto e dispositivo) la copia resta nel browser: l'intero archivio si scarica solo la prima volta su ogni dispositivo, dopo aver premuto "Esci" e ogni 30 giorni per sicurezza. La disconnessione per inattività non cancella la copia.
- **Senza "Uso offline"** la copia vive solo in memoria: ogni volta che apri o ricarichi la pagina si rilegge tutto; finché resta aperta si leggono solo le modifiche.
- Il controllo al ritorno sull'app avviene al massimo una volta al minuto.
- Le eliminazioni sono "lapidi" (`deleted: true`) che conservano il contenuto per il cestino: così gli altri dispositivi le ricevono con la lettura incrementale. Dopo 30 giorni il contenuto viene svuotato. Le regole non permettono di cancellare documenti dall'app.
- **Non cancellare documenti a mano dalla console Firebase**: i dispositivi che li hanno in copia non se ne accorgerebbero fino alla rilettura completa.

Alla prima apertura dopo l'aggiornamento alla 1.4.1 (o successive, se arrivi da una versione precedente) l'app aggiunge `updatedAt` ai documenti esistenti (una scrittura per documento, una volta sola).

La build separa le librerie (`firebase-*.js`, `react-*.js`, `vendor-*.js`) dal codice dell'app (`index-*.js`). Finché non aggiorni le dipendenze i file delle librerie restano identici: a ogni pubblicazione cambia solo il file dell'app. Quando carichi `docs/` su GitHub, cancella i file di `docs/assets/` che non compaiono più nella build e fai un unico commit.

## Dati delle versioni precedenti

La 1.5 ha tolto l'importazione degli estratti conto e dei CSV. I movimenti importati restano normali movimenti. Le vecchie regole d'importazione e la cronologia delle importazioni (documenti `rule:` e `import:`) restano su Firestore ma l'app le ignora; il backup completo le include ancora.
