import { describe, expect, it } from "vitest";
import { taxCodeInfo, validTaxCode, dependentShare } from "../people";
import { taxSummary } from "../tax";
import { pendingRefunds, receiveRefund } from "../refunds";
import { defaultParams } from "../params";
import { DEFAULT_LABELS, type Label, type LedgerRecord, type Movement, type Person } from "../ledger";
import { expense, ledgerOf, loan, repayment } from "./fixtures";

// Codice fiscale di esempio pubblico (Mario Rossi, 1980): formalmente valido.
const SAMPLE_CODE = "RSSMRA80A01H501U";

describe("codice fiscale", () => {
  it("accepts a valid code and extracts birth date and sex", () => {
    expect(validTaxCode(SAMPLE_CODE)).toBe(true);
    expect(taxCodeInfo(SAMPLE_CODE, "2026-11-16")).toEqual({ birthDate: "1980-01-01", sex: "M" });
  });

  it("rejects a wrong check character", () => {
    expect(validTaxCode("RSSMRA80A01H501A")).toBe(false);
    expect(validTaxCode("ABC")).toBe(false);
  });
});

const healthLabel: Label = { ...DEFAULT_LABELS.find((label) => label.id === "health")!, value: {
  ...DEFAULT_LABELS.find((label) => label.id === "health")!.value, deduction: "sanitarie", subDeductions: { Farmacia: "farmaci" },
} };

function health(date: string, amount: number, method: string, subcategory = "Visite", extra?: Movement["value"]["extra"]): Movement {
  const base = expense(date, amount, "fineco", "health");
  return { ...base, value: { ...base.value, method, subcategory, ...(extra ? { extra } : {}) } as Movement["value"] };
}

const settings: LedgerRecord = { kind: "setting", id: "general", version: null, value: { periodStart: 1, deductions: ["sanitarie", "farmaci", "mutuo"] } };

describe("taxSummary", () => {
  it("applies the 129,11 € threshold once to health expenses and medicines together", () => {
    const ledger = ledgerOf(settings, healthLabel, health("2026-02-01", 50_000, "Carta"), health("2026-03-01", 10_000, "Contanti", "Farmacia"));
    const line = taxSummary(ledger, 2026).lines.find((item) => item.key === "sanitarie")!;
    expect(line.total).toBe(60_000);
    expect(line.deductible).toBe(60_000 - 12_911);
    expect(line.benefit).toBe(Math.round((60_000 - 12_911) * 0.19));
  });

  it("excludes a visit paid in cash, but not one forced as deductible", () => {
    const ledger = ledgerOf(settings, healthLabel, health("2026-02-01", 20_000, "Contanti"), health("2026-02-02", 30_000, "Contanti", "Visite", { deduct: "yes" }));
    const summary = taxSummary(ledger, 2026);
    const line = summary.lines.find((item) => item.key === "sanitarie")!;
    expect(line.total).toBe(30_000);
    expect(line.excluded).toBe(20_000);
    expect(summary.warnings.some((text) => text.includes("contanti"))).toBe(true);
  });

  it("subtracts the expected refund from the deductible amount", () => {
    const ledger = ledgerOf(settings, healthLabel, health("2026-02-01", 50_000, "Carta", "Visite", { refund: { amount: 30_000, from: "Fondo", received: "" } }));
    expect(taxSummary(ledger, 2026).lines.find((item) => item.key === "sanitarie")!.total).toBe(20_000);
  });

  it("excludes expenses for a family member not dependent that year", () => {
    const person: Person = { kind: "person", id: "p1", version: null, value: {
      firstName: "Anna", lastName: "Rossi", taxCode: "", relation: "child", birthDate: "", dependent: [{ year: 2025, share: 100 }], order: 0,
    } };
    const ledger = ledgerOf(settings, healthLabel, person, health("2026-02-01", 40_000, "Carta", "Visite", { person: "p1" }));
    expect(dependentShare(person, 2026)).toBe(0);
    expect(taxSummary(ledger, 2026).lines.find((item) => item.key === "sanitarie")!.excluded).toBe(40_000);
  });

  it("caps home mortgage interest at 4.000 €", () => {
    const mortgage = loan("casa", 0);
    const home = { ...mortgage, value: { ...mortgage.value, debt: { ...mortgage.value.debt!, home: true } } } as typeof mortgage;
    const ledger = ledgerOf(settings, home, repayment("2026-05-15", "casa", 10_000, 300_000), repayment("2026-06-15", "casa", 10_000, 200_000));
    const line = taxSummary(ledger, 2026).lines.find((item) => item.key === "mutuo")!;
    expect(line.total).toBe(500_000);
    expect(line.benefit).toBe(Math.round(400_000 * 0.19));
  });

  it("reduces non-health 19% credits for incomes over 120.000 €", () => {
    const params: LedgerRecord = { kind: "param", id: "2026", version: null, value: { ...defaultParams(2026), income: 18_000_000 } };
    const withTransport: LedgerRecord = { ...settings, value: { periodStart: 1, deductions: ["trasporti"] } } as LedgerRecord;
    const fees = DEFAULT_LABELS.find((label) => label.id === "transport")!;
    const label: Label = { ...fees, value: { ...fees.value, deduction: "trasporti" } };
    const ticket = expense("2026-01-10", 20_000, "fineco", "transport");
    const ledger = ledgerOf(withTransport, params, label, { ...ticket, value: { ...ticket.value, method: "Carta" } as Movement["value"] });
    const line = taxSummary(ledger, 2026).lines.find((item) => item.key === "trasporti")!;
    expect(line.benefit).toBe(Math.round(20_000 * 0.19 * 0.5));
  });
});

describe("refunds", () => {
  it("lists pending refunds and registers the income when received", () => {
    const spent = health("2026-01-01", 50_000, "Carta", "Visite", { refund: { amount: 20_000, from: "Fondo", received: "" } });
    const ledger = ledgerOf(spent);
    const [item] = pendingRefunds(ledger, "2026-03-01");
    expect(item.amount).toBe(20_000);
    const actions = receiveRefund(ledger, item, "2026-03-01", 20_000, true);
    expect(actions).toHaveLength(2);
    const after = ledgerOf(...actions.flatMap((action) => (action.op === "save" ? [action.record] : [])));
    expect(pendingRefunds(after, "2026-03-01")).toHaveLength(0);
    expect(after.movements.some((movement) => movement.value.type === "income" && movement.value.amount === 20_000)).toBe(true);
  });
});
