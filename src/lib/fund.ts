import { accountBalances, expenseParts, shiftMonth, type Account, type Ledger } from "./ledger";
import { activeLines } from "./deposit";
import { fundSettings, paramsFor, type FundSettings } from "./params";

/*
 * Fondo di emergenza.
 *
 * Mesi coperti = liquidità pesata ÷ spese essenziali medie mensili.
 * Pesi predefiniti (modificabili): disponibile subito 100%, in 1-3 giorni 95%, entro un mese 70%,
 * vincoli lunghi 0%, investimenti 50% (facoltativi: il loro valore oscilla proprio nelle crisi).
 * Le linee vincolate di un conto deposito pesano secondo lo svincolo anticipato.
 */

export type Bucket = "now" | "days" | "month" | "long" | "investment";

export const BUCKET_LABELS: Record<Bucket, string> = {
  now: "Disponibile subito", days: "In 1-3 giorni lavorativi", month: "Entro un mese", long: "Vincolato a lungo", investment: "Investimenti",
};

export type FundRow = { account: Account; label: string; amount: number; bucket: Bucket; weight: number; weighted: number };

export type FundStatus = {
  rows: FundRow[];
  total: number;
  weighted: number;
  now: number;
  essential: number;
  essentialMonths: number;
  monthsCovered: number | null;
  monthsNow: number | null;
  target: number;
  missing: number;
  dedicated: number;
  banks: { bank: string; amount: number; over: boolean }[];
  settings: FundSettings;
  estimatedEssentials: boolean;
};

const ESSENTIAL_MONTHS = 12;

/** Spese essenziali medie degli ultimi 12 mesi completi (categorie segnate come essenziali, più le rate dei debiti). */
export function essentialMonthly(ledger: Ledger, today: string): { amount: number; months: number; estimated: boolean } {
  const essential = new Set(ledger.labels.filter((label) => label.value.essential).map((label) => label.id));
  const estimated = essential.size === 0;
  const lastMonth = shiftMonth(today.slice(0, 7), -1);
  const firstMonth = shiftMonth(lastMonth, -(ESSENTIAL_MONTHS - 1));
  let total = 0;
  const active = new Set<string>();
  for (const { value } of ledger.movements) {
    const month = value.date.slice(0, 7);
    if (month < firstMonth || month > lastMonth) continue;
    active.add(month);
    if (value.type === "repayment") { total += value.amount; continue; }
    if (value.type !== "expense") continue;
    for (const part of expenseParts(value)) if (estimated || essential.has(part.labelId)) total += part.amount;
  }
  const months = Math.max(1, active.size);
  return { amount: Math.round(total / months), months: active.size, estimated };
}

function accountBucket(account: Account): Bucket | null {
  const type = account.value.type;
  if (type === "investment") return "investment";
  if (type !== "cash" && type !== "asset") return null;
  if (account.value.liquidity) return account.value.liquidity.availability;
  if (account.value.deposit?.kind === "locked") return "long";
  // "Altre attività" (auto, oggetti, contanti da parte…) non sono liquidità: contano solo se indichi la disponibilità.
  return type === "cash" ? "now" : "long";
}

function lineBucket(early: string): Bucket {
  return early === "none" ? "long" : "days";
}

export function fundStatus(ledger: Ledger, today: string): FundStatus {
  const settings = fundSettings(ledger.settings);
  const weights = settings.weights;
  const balances = accountBalances(ledger, today.slice(0, 7));
  const rows: FundRow[] = [];
  const banks = new Map<string, number>();
  let dedicated = 0;
  for (const { account, amount } of balances) {
    if (account.value.archived || amount === null) continue;
    const bucket = accountBucket(account);
    if (!bucket) continue;
    if (bucket === "investment" && !settings.includeInvestments) continue;
    const share = (account.value.share ?? 100) / 100;
    const own = Math.round(amount * share);
    const lines = activeLines(account.value.deposit, today);
    const locked = lines.reduce((sum, line) => sum + line.amount, 0);
    const free = Math.max(0, own - Math.round(locked * share));
    const weightOf = (target: Bucket) => account.value.liquidity?.weight ?? weights[target];
    rows.push({ account, label: account.value.name, amount: free, bucket, weight: weightOf(bucket), weighted: Math.round(free * weightOf(bucket) / 100) });
    for (const line of lines) {
      const lineAmount = Math.round(line.amount * share);
      const target = lineBucket(line.early);
      rows.push({ account, label: `${account.value.name} · vincolo fino al ${line.end.split("-").reverse().join("/")}`, amount: lineAmount, bucket: target,
        weight: weights[target], weighted: Math.round(lineAmount * weights[target] / 100) });
    }
    if (account.value.liquidity?.emergency) dedicated += own;
    if (bucket !== "investment") {
      const bank = account.value.deposit?.bank?.trim() || account.value.name;
      banks.set(bank, (banks.get(bank) ?? 0) + Math.max(0, amount));
    }
  }
  const guarantee = paramsFor(ledger, Number(today.slice(0, 4))).value.depositGuarantee;
  const essentials = essentialMonthly(ledger, today);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const weighted = rows.reduce((sum, row) => sum + row.weighted, 0);
  const now = rows.filter((row) => row.bucket === "now").reduce((sum, row) => sum + row.weighted, 0);
  const target = essentials.amount * settings.targetMonths;
  return {
    rows, total, weighted, now,
    essential: essentials.amount, essentialMonths: essentials.months, estimatedEssentials: essentials.estimated,
    monthsCovered: essentials.amount > 0 ? weighted / essentials.amount : null,
    monthsNow: essentials.amount > 0 ? now / essentials.amount : null,
    target, missing: Math.max(0, target - weighted), dedicated,
    banks: [...banks].map(([bank, amount]) => ({ bank, amount, over: amount > guarantee })).sort((a, b) => b.amount - a.amount),
    settings,
  };
}

/** Mesi per arrivare all'obiettivo risparmiando `monthly` al mese (null se non si arriva). */
export function monthsToTarget(missing: number, monthly: number) {
  if (missing <= 0) return 0;
  return monthly > 0 ? Math.ceil(missing / monthly) : null;
}
