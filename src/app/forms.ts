// Moduli e finestre di LedgerApp: quale modulo è aperto, con il suo titolo e il suggerimento sotto.
import type { Account, Balance, Budget, Goal, Label, Ledger, Movement, Recurring, Template } from "../lib/ledger";
import type { DueItem } from "../lib/recurring";

export type EditForm =
  | { type: "movement"; id: string; initial?: Movement; preset?: Movement["value"]; heading?: string; hint?: string }
  | { type: "investment"; id: string; initial?: Account }
  | { type: "debt"; id: string; initial?: Account }
  | { type: "occurrence"; item: DueItem }
  | { type: "recurring"; id: string; initial?: Recurring }
  | { type: "balance"; account: Account; month?: string }
  | { type: "account"; id: string; initial?: Account }
  | { type: "label"; id: string; labelType: "expense" | "income"; initial?: Label }
  | { type: "restore" }
  | { type: "budget"; id: string; initial?: Budget }
  | { type: "goal"; id: string; initial?: Goal }
  | { type: "summary"; period: string }
  | { type: "style"; id: string; record: Account | Label }
  | { type: "reset" }
  | { type: "template"; id: string; initial?: Template }
  | { type: "credit"; id: string; initial?: Account }
  | { type: "quick"; kind: "expense" | "income" }
  | { type: "simulate"; debt: Account }
  | { type: "search" };
export type Form =
  | EditForm
  | { type: "delete"; record: Movement | Balance | Recurring; back: EditForm }
  | { type: "archive"; target: Account | Label; back: EditForm }
  | { type: "remove"; target: Account | Label; back: EditForm };

/** Titolo e suggerimento della finestra del modulo aperto. */
export function formHeading(form: Form, ledger: Ledger): { title: string; hint?: string } {
  const presetDebt = form?.type === "movement" && form.preset?.type === "repayment" ? ledger.accounts.find((account) => account.id === (form.preset as { debtId: string }).debtId) : undefined;
  const flexiblePreset = presetDebt?.value.debt?.kind === "flexible";
  const presetTransfer = form?.type === "movement" && form.preset?.type === "transfer" ? form.preset : null;
  const presetCredit = presetTransfer ? ledger.accounts.find((account) => account.value.type === "receivable" && (account.id === presetTransfer.accountId || account.id === presetTransfer.toAccountId)) : undefined;
  const presetTransferTitle = presetCredit ? (presetTransfer?.accountId === presetCredit.id ? "Restituzione · " : "Prestito · ") + presetCredit.value.name : null;
  const title = form?.type === "movement" ? (form.heading ?? (form.initial ? "Modifica movimento" : form.preset?.type === "repayment" ? (flexiblePreset ? "Registra rimborso" : "Registra rata")
    : form.preset?.type === "transfer" ? (presetTransferTitle ?? "Versamento") : "Nuovo movimento"))
    : form?.type === "investment" ? (form.initial ? "Modifica investimento" : "Nuovo investimento")
    : form?.type === "debt" ? (form.initial ? "Modifica debito" : "Nuovo debito")
    : form?.type === "occurrence" ? "Registra ricorrente"
    : form?.type === "recurring" ? (form.initial ? "Modifica ricorrente" : "Nuovo ricorrente")
    : form?.type === "balance" ? (form.account.value.type === "debt" ? "Correggi residuo · " : form.account.value.type === "investment" ? "Aggiorna valore · " : "Saldo · ") + form.account.value.name
    : form?.type === "account" ? (form.initial ? "Modifica conto" : "Nuovo conto")
    : form?.type === "label" ? (form.initial ? (form.labelType === "expense" ? "Modifica categoria" : "Modifica fonte") : form.labelType === "expense" ? "Nuova categoria" : "Nuova fonte")
    : form?.type === "restore" ? "Ripristina un backup"
    : form?.type === "template" ? (form.initial ? "Modifica preferito" : "Nuovo preferito")
    : form?.type === "budget" ? (form.initial ? "Modifica budget" : "Nuovo budget")
    : form?.type === "goal" ? (form.initial ? "Modifica obiettivo" : "Nuovo obiettivo")
    : form?.type === "summary" ? "Riepilogo"
    : form?.type === "style" ? `Aspetto · ${form.record.value.name}`
    : form?.type === "reset" ? "Ricomincia da zero"
    : form?.type === "credit" ? (form.initial ? "Modifica credito" : "Nuovo credito")
    : form?.type === "quick" ? (form.kind === "income" ? "Entrata veloce" : "Spesa veloce")
    : form?.type === "simulate" ? `Simula estinzione · ${form.debt.value.name}`
    : form?.type === "search" ? "Cerca"
    : form?.type === "archive" ? (form.target.value.archived ? "Ripristina" : "Archivia") + " · " + form.target.value.name
    : form?.type === "remove" ? "Elimina · " + form.target.value.name
    : "Elimina voce";
  const hint = form.type === "movement" ? (form.hint ?? (form.preset?.type === "repayment" ? (flexiblePreset ? "Inserisci quanto hai restituito: il residuo scende di tutto l’importo." : "Controlla importo e data: la divisione si aggiorna da sola.")
            : form.preset?.type === "transfer" ? (presetCredit ? "Un trasferimento tra il tuo conto e il credito: non è né spesa né entrata." : "Un trasferimento dal conto all’investimento: non conta come spesa.") : "Inserisci i dettagli del movimento."))
          : form.type === "template" ? "Un movimento modello: lo registri con un tocco dall’inserimento veloce."
          : form.type === "occurrence" ? "Controlla i dati prima di registrare questa scadenza."
          : form.type === "recurring" ? "Le scadenze ti verranno proposte da confermare." : undefined;
  return { title, hint };
}
