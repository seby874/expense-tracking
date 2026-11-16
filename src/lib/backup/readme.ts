// Testo di LEGGIMI.md incluso in ogni backup: descrive i file e come portare i dati altrove.

export function readmeText(exportedAt: string, counts: Record<string, number>) {
  const list = Object.entries(counts).map(([name, count]) => `- ${name}: ${count}`).join("\n");
  return `# Backup di Expense Tracking

Creato il ${exportedAt}. Formato dati: versione 2.

Questo archivio contiene **tutti i tuoi dati** in formati aperti: puoi leggerli e spostarli
anche senza l'app, oggi o tra molti anni.

Voci incluse:
${list}

## Cosa c'è dentro

| File | A cosa serve |
|---|---|
| \`dati/backup.json\` | Tutto, per **ripristinare** nell'app (Impostazioni → I tuoi dati → Ripristina backup). |
| \`dati/schema.json\` | Descrizione formale dei dati (JSON Schema). |
| \`fogli/*.csv\` | Una tabella per tipo di dato, per **Excel** e **Google Sheets**. |
| \`database/dati.sql\` | Tabelle e dati per **PostgreSQL, MySQL/MariaDB, SQLite**. |
| \`LEGGIMI.md\` | Questa guida. |

## Come sono scritti i dati

- **Importi**: in \`backup.json\` e \`dati.sql\` sono in **centesimi** (12,50 € = \`1250\`); nei CSV in euro con la virgola.
- **Date**: \`AAAA-MM-GG\`; i mesi \`AAAA-MM\`.
- **ID**: ogni voce ha un \`id\`; i collegamenti usano questi ID (es. \`accountId\` di un movimento = \`id\` di un conto).
- **Tipi di voce** (\`kind\`): movement (movimento), balance (saldo a fine mese), account (conto),
  label (categoria/fonte), recurring (ricorrente), template (preferito), budget, goal (obiettivo),
  setting (impostazioni), person (familiare), deadline (scadenza), param (parametri di legge di un anno),
  archive (anno archiviato: contiene movimenti e saldi di quell'anno nel campo \`records\`).
- **Movimenti** (\`type\`): expense (spesa), income (entrata), transfer (trasferimento tra conti),
  repayment (rata di un debito: \`principal\` capitale + \`interest\` interessi = \`amount\`).
- **Saldo di un conto** = ultimo saldo registrato (\`balance\`) + movimenti dei mesi successivi.
- I **codici fiscali** dei familiari sono solo in \`backup.json\` e \`dati.sql\`, non nei CSV.

## Migrare ad altre soluzioni

### Excel
1. Estrai l'archivio .zip (tasto destro → Estrai tutto).
2. Apri i file in \`fogli/\` con doppio clic: separatore **punto e virgola**, decimali con la **virgola**
   (impostazioni italiane). Se le colonne non si separano: Dati → Da testo/CSV → Delimitatore ";", Origine UTF-8.
3. Per riepiloghi: seleziona \`movimenti.csv\` → Inserisci → Tabella pivot (righe: Mese o Categoria, valori: Importo).
4. Per collegare tabelle (es. il nome del conto) usa CERCA.X sulla colonna ID.

### Google Sheets
1. Apri Google Sheets → File → Importa → Carica → scegli un CSV di \`fogli/\`.
2. Tipo di separatore: **Personalizzato ";"**; "Converti testo in numeri e date": sì.
3. Impostazioni del foglio → Impostazioni internazionali **Italia** (per la virgola decimale).
4. Ripeti per ogni CSV, importando come nuovi fogli dello stesso file.

### Database su un server (PostgreSQL, MySQL/MariaDB, SQLite)
- SQLite: \`sqlite3 expense.db < database/dati.sql\`
- PostgreSQL: \`psql -d expense -f database/dati.sql\`
- MySQL/MariaDB: \`mysql expense < database/dati.sql\`

Il file crea le tabelle \`voci\` (tutte le voci in JSON), \`movimenti\`, \`saldi\`, \`conti\`, \`categorie\`.
Esempi di interrogazioni:

\`\`\`sql
-- Spese per mese
SELECT substr(data, 1, 7) AS mese, SUM(importo_centesimi) / 100.0 AS spese
FROM movimenti WHERE tipo = 'expense' GROUP BY mese ORDER BY mese;

-- Spese per categoria in un anno
SELECT c.nome, SUM(m.importo_centesimi) / 100.0
FROM movimenti m JOIN categorie c ON c.id = m.categoria_id
WHERE m.tipo = 'expense' AND m.data LIKE '2026-%' GROUP BY c.nome;
\`\`\`

### La stessa app su un altro progetto Firebase o un altro account
1. Crea un progetto Firebase (Authentication con email/password, Firestore).
2. Nel codice dell'app (repository GitHub) sostituisci la configurazione in \`src/lib/firebase.ts\`.
3. In \`firestore.rules\` metti l'UID del nuovo account e pubblica le regole.
4. Pubblica l'app (\`npm run build\`, cartella \`docs/\`), accedi, poi Impostazioni → Ripristina backup con questo file.

### Un'altra app di finanza personale (Firefly III, Actual, YNAB…)
Usa \`fogli/movimenti.csv\`: le colonne Data, Descrizione, Importo, Categoria, Conto sono quelle che
quasi tutte le app chiedono di abbinare in fase di importazione. Le spese hanno importo negativo.

## Backup cifrati (.etbackup)

Se nelle Impostazioni hai impostato una password, il backup è un file \`.etbackup\`:
l'intero archivio .zip cifrato con **AES-256-GCM**, chiave ricavata dalla password con **PBKDF2-SHA-256**.
Struttura: "ETBACKUP" (8 byte) · versione (1 byte) · iterazioni (4 byte, big endian) · sale (16 byte) ·
vettore iniziale (12 byte) · dati cifrati. Per aprirlo senza l'app, con Python e la libreria \`cryptography\`:

\`\`\`python
import struct, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
data = open(sys.argv[1], "rb").read()
assert data[:8] == b"ETBACKUP"
iterations = struct.unpack(">I", data[9:13])[0]
salt, iv = data[13:29], data[29:41]
key = PBKDF2HMAC(hashes.SHA256(), 32, salt, iterations).derive(sys.argv[2].encode())
open("backup.zip", "wb").write(AESGCM(key).decrypt(iv, data[41:], None))
\`\`\`

Uso: \`python apri_backup.py file.etbackup "la-tua-password"\` → crea \`backup.zip\`.
Senza la password il file **non si può aprire in alcun modo**.
`;
}
