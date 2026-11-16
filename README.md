# Expense Tracking

App personale in italiano per registrare entrate, spese, trasferimenti, saldi dei conti e patrimonio netto. Interfaccia React + Vite, dati su Cloud Firestore, accesso con Firebase Authentication (email e password).

## Novità della 2.0

Pensata per durare anni senza modifiche: regole e parametri di legge sono dati modificabili, i dati sono portabili.

- **Funzioni attivabili** (Impostazioni → Funzioni): accendi solo ciò che ti serve; la Dichiarazione parte spenta.
- **Parametri di legge e bancari** per anno (ritenuta 26%, bollo, garanzia dei depositi, penali di estinzione, detrazioni, reddito, inflazione): «Nuovo anno» copia l'anno prima; a gennaio il controllo di salute chiede di confermarli.
- **Archivio annuale**: gli anni chiusi diventano pochi documenti (meno letture Firestore), visibili ma in sola lettura; si riaprono con un clic.
- **Backup automatico portatile**: un .zip con dati (JSON), fogli CSV per Excel/Google Sheets, database SQL, schema e LEGGIMI con la guida per migrare. Giornaliero su PC (cartella scelta, anche dentro Google Drive per desktop; si tengono 7 giorni + 4 settimane + 12 mesi), settimanale sul telefono. Cifratura facoltativa con password (.etbackup, AES-256).
- **Familiari** con codice fiscale verificato (nascosto in modalità discreta e assente dai CSV) e anni a carico; ogni spesa può essere «sostenuta per» un familiare.
- **Dichiarazione dei redditi** (stima): franchigie, tetti, pagamenti tracciabili, rimborsi esclusi, familiari a carico, redditi alti; esportazione per il CAF.
- **Rimborsi attesi** (fondo sanitario, assicurazione, nota spese) con «Ricevuto» che registra l'entrata.
- **Fondo di emergenza** (Patrimonio → Fondo): mesi coperti con liquidità pesata per disponibilità (subito 100%, 1-3 giorni 95%, entro un mese 70%, vincoli 0%, investimenti facoltativi 50%: modificabili) e «coperti subito»; conti deposito con tassi a fasi, linee vincolate, accredito, bollo a carico tuo o della banca, svincolo anticipato, avviso oltre la garanzia di 100.000 € per banca.
- **Spese fisse e abbonamenti** (Analisi → Spese fisse): costo mensile/annuo, quota condivisa, sospensioni, storico dei prezzi e aumenti, prove gratuite e disdette, bollette **per competenza** (selettore cassa/competenza), possibili ricorrenti non ancora impostati.
- **Simulatore di estinzione anticipata** (Debiti → Simula): riduci durata o rata, rata o durata scelta, rinegoziazione, versamenti mensili, estinzione totale, surroga, tasso variabile; penali, detrazione persa, effetto sul fondo, confronto con l'investimento; «Applica» aggiorna il piano.
- **Anno su anno**, **Proiezione** del patrimonio (fasce, valori a prezzi di oggi, domanda inversa, traguardi), **Calendario**, **Scadenze** (veicoli, documenti, garanzie, contratti), **Report annuale** proposto a gennaio, **Dossier per i familiari**.
- **Controllo di salute** alla prima apertura del mese: backup, letture, voci non valide, saldi, scarti, ricorrenti arretrati, doppioni, debiti, fondo, abbonamenti, parametri, familiari, scadenze, rimborsi, cestino.
- **Dati di esempio** di 10 anni, relativi all'anno corrente, per provare tutto.

Non ci sono più l'uso offline e lo sblocco con impronta: tolti per sicurezza (la copia locale non cifrata e lo sblocco aggirabile).

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
- **Panoramica a scelta**: riquadri da accendere, spegnere e riordinare (Impostazioni → Panoramica, per dispositivo).
- **Budget** mensili o complessivi per categoria, tag o tutte le spese, con avviso all’80% (Analisi e Panoramica).
- **Obiettivi di risparmio** collegati al saldo di un conto o aggiornati a mano, con la quota da mettere da parte al mese (Patrimonio → Obiettivi).
- **Previsione dei prossimi 30 giorni** per ogni conto di liquidità: ricorrenti, rate e movimenti futuri, con avviso se un conto va in rosso.
- **Andamento del patrimonio** su 12 mesi, 24 mesi o tutto, con liquidità, investimenti e debiti e l’origine della variazione (risparmio, rendimento, altro).
- **Riepilogo del mese o dell’anno**, stampabile come PDF, e **segnalazioni** rispetto alla tua media.
- **Inizio del mese personalizzato** (es. dal 27 al 26): vale per entrate, spese, budget e analisi; i saldi restano di fine mese di calendario.
- **Colori, icone e ordine** di conti e categorie (Impostazioni → Conti e categorie) e **colore principale** dell’app.
- **Registro**: filtri avanzati (conto, importo, date, tutti i periodi), **filtri salvati**, **selezione multipla** (categoria, tag, eliminazione) e **gesti** sul telefono (destra = duplica, sinistra = elimina).
- **Scorciatoie da tastiera**: N nuovo movimento, V spesa veloce, / cerca, 1–5 sezioni, D modalità discreta.
- **Ricomincia da zero**: svuota l’archivio (tutto nel cestino, ripristinabile per 30 giorni) e riparte con conti e categorie iniziali.
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
- **Nessuna copia dei dati sul dispositivo**: l’archivio vive solo in memoria mentre la pagina è aperta. Le versioni fino alla 1.7.0 avevano «Uso offline» e lo sblocco con impronta: alla prima apertura la copia locale, il service worker e le relative preferenze vengono cancellati.
- **Conflitti tra dispositivi**: i salvataggi fino a 450 voci avvengono in una transazione che controlla che nessun altro dispositivo abbia cambiato le stesse voci; una scadenza ricorrente ha un ID fisso, quindi non si registra due volte.

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
  app/planning.tsx      budget, obiettivi, previsione, segnalazioni, riepilogo, andamento del patrimonio
  app/style.tsx         colori e icone
  lib/investments.ts    valore, versato e rendimento degli investimenti
  lib/data-io.ts        esportazione CSV, backup e ripristino
  lib/planning.ts       calcoli di previsione, budget, obiettivi, segnalazioni e riepiloghi
  lib/preferences.ts    tema e personalizzazione (per dispositivo)
  lib/offline-shell.ts  rimozione del service worker delle versioni precedenti (public/sw.js si disinstalla da solo)
  lib/config.ts         nome dell'app e opzioni (reset password, minuti di inattività)
  lib/firebase.ts       configurazione Firebase
  lib/local-ledger.ts   lettura e scrittura su Firestore (solo le modifiche, vedi sotto)
  lib/ledger-sync.ts    copia in memoria dell'archivio, cursore delle modifiche, controllo dei conflitti (planWrite)
  lib/params.ts         parametri di legge e bancari per anno, funzioni attivabili, pesi del fondo
  lib/archive.ts        archivio annuale (anni chiusi in pochi documenti, sola lettura)
  lib/backup/           backup portatile: zip, cifratura, contenuto (CSV, SQL, LEGGIMI), cartella e rotazione, frequenza
  lib/people.ts         familiari e codice fiscale
  lib/tax.ts            stima delle detrazioni (Dichiarazione)
  lib/refunds.ts        rimborsi attesi
  lib/deposit.ts        interessi dei conti deposito (tassi a fasi, vincoli, ritenuta, bollo)
  lib/fund.ts           fondo di emergenza (mesi coperti, liquidità pesata, garanzia per banca)
  lib/fixed.ts          spese fisse, abbonamenti, bollette per competenza
  lib/loan-sim.ts       simulatore di estinzione anticipata
  lib/yoy.ts            confronto anno su anno
  lib/projection.ts     proiezione del patrimonio
  lib/calendar.ts       calendario finanziario
  lib/deadlines.ts      scadenzario
  lib/report.ts         report annuale
  lib/health.ts         controllo di salute mensile
  lib/__tests__/        test (Vitest)
  app/settings-v2.tsx   funzioni, familiari, parametri, detrazioni, backup, archivio
  app/analysis.tsx      schede di Analisi, Dichiarazione, rimborsi
  app/fund.tsx          fondo di emergenza e conti deposito
  app/fixed.tsx         spese fisse e abbonamenti
  app/loan-sim.tsx      simulatore di estinzione
  app/planning-v2.tsx   anno su anno, proiezione, calendario, scadenze, report, dossier, controllo di salute
.github/workflows/ci.yml  controlli automatici (tipi, test, build, docs/ aggiornata)
firestore.rules         regole di sicurezza da pubblicare nella console Firebase
docs/                   build pronta per GitHub Pages
```

## Sviluppo

Serve Node.js 22.12+ (o 24).

```sh
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test           # test dei calcoli (Vitest)
npm run build      # rigenera la cartella docs/
```

Dopo ogni modifica esegui `npm run build` e carica anche la cartella `docs/` aggiornata. Il file `docs/.nojekyll` viene ricreato in automatico dalla build.

## Pubblicazione

GitHub Pages: **Settings → Pages → Deploy from a branch → main → /docs**.

Prima di usare l’app online, nella console Firebase:

1. Pubblica `firestore.rules` (Firestore Database → Regole). Quando aggiorni l'app, pubblica prima le regole e subito dopo la cartella `docs/`.
   La 2.0 aggiunge i tipi `person`, `deadline`, `param`, `archive` e la cancellazione delle lapidi vuote: senza le regole nuove questi salvataggi vengono rifiutati.
2. Aggiungi `TUO-UTENTE.github.io` ai domini autorizzati (Authentication → Impostazioni).
3. Disattiva la registrazione di nuovi utenti e lascia attiva la protezione dall’enumerazione delle email.
4. Limita la chiave API ai referrer del sito (Google Cloud Console → Credenziali).

Il codice pubblicato è visibile a tutti: la configurazione Firebase in `src/lib/firebase.ts` non è un segreto, la protezione dei dati è data dalle regole Firestore e dalle restrizioni della chiave.

## Letture Firestore e limiti gratuiti

Il piano gratuito concede 50.000 letture, 20.000 scritture e 20.000 eliminazioni al giorno.

- Ogni documento salvato ha `updatedAt` (ora del server). L'app chiede al server solo i documenti più recenti dell'ultimo già visto: **minimo 1 lettura** per controllo, anche se non è cambiato nulla.
- La copia vive solo in memoria: ogni volta che apri o ricarichi la pagina si rilegge tutto; finché resta aperta si leggono solo le modifiche (e tutto ogni 30 giorni, per sicurezza).
- Il controllo al ritorno sull'app avviene al massimo una volta al minuto.
- Le eliminazioni sono "lapidi" (`deleted: true`) che conservano il contenuto per il cestino: così gli altri dispositivi le ricevono con la lettura incrementale. Dopo 30 giorni il contenuto viene svuotato; dopo altri 60 giorni la lapide vuota viene cancellata davvero, così non si rilegge più. Le regole permettono di cancellare solo le lapidi vuote.
- **Non cancellare documenti a mano dalla console Firebase**: i dispositivi che li hanno in copia non se ne accorgerebbero fino alla rilettura completa.

Alla prima apertura dopo l'aggiornamento alla 1.4.1 (o successive, se arrivi da una versione precedente) l'app aggiunge `updatedAt` ai documenti esistenti (una scrittura per documento, una volta sola).

La build separa le librerie (`firebase-*.js`, `react-*.js`, `vendor-*.js`) dal codice dell'app (`index-*.js`). Finché non aggiorni le dipendenze i file delle librerie restano identici: a ogni pubblicazione cambia solo il file dell'app. Quando carichi `docs/` su GitHub, cancella i file di `docs/assets/` che non compaiono più nella build e fai un unico commit.

## Dati delle versioni precedenti

La 1.5 ha tolto l'importazione degli estratti conto e dei CSV. I movimenti importati restano normali movimenti. Le vecchie regole d'importazione e la cronologia delle importazioni (documenti `rule:` e `import:`) restano su Firestore ma l'app le ignora; il backup completo le include ancora.
