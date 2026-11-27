import { describe, expect, it } from "vitest";
import { adjustmentProblem, budgetMonitor, periodWindow, spendingStatus, yearProgress } from "../src/budget-monitor";
import { OrgTree } from "../src/org";
import { can, type Actor } from "../src/policy";
import { ROLES, type Role } from "../src/roles";
import { money } from "../src/money";

const year = (amount: string) => Array.from({ length: 12 }, () => money(amount));
const pay = (lineId: string, state: "paid" | "submitted" | "scheduled" | "draft" | "returned", gross: string, paidOn: string | null = null) => ({ lineId, state, gross: money(gross), paidOn });

describe("spendingStatus (36_Budget_Monitoring: Aman < 80%, Warning 80–95%, Over > 95%)", () => {
  it("bands the use of the annual budget", () => {
    expect(["0", "79.9", "80", "95", "95.1"].map((v) => spendingStatus(money(v)))).toEqual(["safe", "safe", "warning", "warning", "over"]);
    expect(spendingStatus(null)).toBe("safe");
  });
});

describe("yearProgress", () => {
  it("is the share of the budget year gone by", () => {
    expect(yearProgress(2027, "2026-11-27").toString()).toBe("0");
    expect(yearProgress(2026, "2026-07-02").toFixed(4)).toBe("0.5014");
    expect(yearProgress(2025, "2026-01-01").toString()).toBe("1");
  });
});

describe("budgetMonitor (34–36 and 38: per cost center and COA)", () => {
  const lines = [
    { id: "a", unit: "SCM", coaCode: "6241", coaName: "Internet", category: "OPEX" as const, months: year("100") },
    { id: "b", unit: "SCM", coaCode: "6241", coaName: "Internet", category: "OPEX" as const, months: year("100") },
    { id: "c", unit: "SCM", coaCode: "5300", coaName: "Jaringan", category: "COGS" as const, months: year("50") },
    { id: "r", unit: "SCM", coaCode: "4110", coaName: "Router", category: "Revenue" as const, months: year("999") },
    { id: "d", unit: "BCD", coaCode: "6100", coaName: "Promosi", category: "OPEX" as const, months: year("10") },
  ];
  const payments = [
    pay("a", "paid", "1200", "2026-02-10"),
    pay("a", "paid", "999", "2025-12-31"),
    pay("b", "submitted", "300"),
    pay("b", "scheduled", "100"),
    pay("b", "draft", "5000"),
    pay("b", "returned", "5000"),
    pay("d", "paid", "119", "2026-03-01"),
  ];
  // 30 June: half of the flat monthly plan is due.
  const m = budgetMonitor(lines, payments, [], { year: 2026, asOf: "2026-06-30", period: "ytd" });
  const scm = m.units.find((u) => u.unit === "SCM")!;
  const coa = scm.accounts.find((a) => a.coaCode === "6241")!;

  it("counts paid in the year as actual, and submitted to scheduled as committed", () => {
    expect([coa.budget, coa.actual, coa.committed, coa.used, coa.remaining].map(String)).toEqual(["2400", "1200", "400", "1600", "800"]);
    expect(coa.utilisation!.toFixed(1)).toBe("66.7");
    expect(coa.status).toBe("safe");
  });
  it("pro-rates the budget, and projects the year end from the pace", () => {
    expect([coa.prorata.toString(), coa.variance.toString(), coa.forecast!.toFixed(0)]).toEqual(["1200", "0", "2420"]);
  });
  it("rolls accounts up to the unit and the company, leaving revenue out", () => {
    expect(scm.accounts.map((a) => a.coaCode)).toEqual(["5300", "6241"]);
    expect([scm.budget.toString(), scm.used.toString()]).toEqual(["3000", "1600"]);
    expect([m.total.budget.toString(), m.total.actual.toString(), m.total.committed.toString()]).toEqual(["3120", "1319", "400"]);
    expect(m.units.find((u) => u.unit === "BCD")!.status).toBe("over");
  });
  it("has no forecast before the year starts", () => {
    expect(budgetMonitor(lines, [], [], { year: 2027, asOf: "2026-11-27", period: "ytd" }).total.forecast).toBeNull();
  });
});

describe("periodWindow (27_Budget_vs_Actual: as-of date and period; plan E3 MTD, QTD, YTD)", () => {
  it("starts at the month, quarter or year of the as-of date, inside the budget year", () => {
    expect(periodWindow(2027, "2027-05-17", "mtd")).toEqual({ from: "2027-05-01", to: "2027-05-17" });
    expect(periodWindow(2027, "2027-05-17", "qtd")).toEqual({ from: "2027-04-01", to: "2027-05-17" });
    expect(periodWindow(2027, "2027-05-17", "ytd")).toEqual({ from: "2027-01-01", to: "2027-05-17" });
    expect(periodWindow(2027, "2028-03-01", "qtd")).toEqual({ from: "2027-10-01", to: "2027-12-31" });
    expect(periodWindow(2027, "2026-12-31", "ytd")).toBeNull();
  });
});

describe("budgetMonitor as of a date, with Accounting's adjustments (27a_Daily_Actuals)", () => {
  const lines = [{ id: "a", unit: "SCM", coaCode: "6241", coaName: "Internet", category: "OPEX" as const, months: [money("310"), money("280"), money("620"), ...year("0").slice(3)] }];
  const payments = [pay("a", "paid", "100", "2027-01-20"), pay("a", "paid", "200", "2027-03-05"), pay("a", "paid", "900", "2027-03-20")];
  const adjustments = [
    { unit: "SCM", coaCode: "6241", date: "2027-03-10", amount: money("50") },
    { unit: "SCM", coaCode: "6241", date: "2027-01-02", amount: money("-10") },
    { unit: "SCM", coaCode: "9999", date: "2027-03-01", amount: money("1") },
  ];
  const at = (period: "mtd" | "ytd") => budgetMonitor(lines, payments, adjustments, { year: 2027, asOf: "2027-03-15", period }).units[0]!;

  it("phases the period budget by month, the running month by its days", () => {
    expect(at("mtd").prorata.toString()).toBe("300");
    expect(at("ytd").prorata.toString()).toBe("890");
  });
  it("keeps adjustments apart from the automatic feed, and counts both against the budget", () => {
    const m = at("mtd");
    expect([m.actual.toString(), m.adjustment.toString(), m.variance.toString()]).toEqual(["200", "51", "-49"]);
    const y = at("ytd");
    expect([y.actual.toString(), y.adjustment.toString(), y.used.toString()]).toEqual(["300", "41", "341"]);
  });
  it("shows an adjustment on an account without budget lines under its unit", () => {
    expect(at("ytd").accounts.map((a) => [a.coaCode, a.adjustment.toString()])).toEqual([["6241", "40"], ["9999", "1"]]);
  });
});

describe("manual adjustments (27a_Daily_Actuals: Accounting, accrual or correction)", () => {
  const input = { date: "2027-03-10", amount: "50000", reason: "Akrual tagihan listrik Februari", today: "2027-03-15" };
  it("needs a non-zero amount, a date up to today and a reason", () => {
    expect(adjustmentProblem(input)).toBeNull();
    expect(adjustmentProblem({ ...input, amount: "0" })).toBe("amount");
    expect(adjustmentProblem({ ...input, amount: "abc" })).toBe("amount");
    expect(adjustmentProblem({ ...input, date: "2027-03-16" })).toBe("date");
    expect(adjustmentProblem({ ...input, reason: "x" })).toBe("reason");
  });
  it("keeps to the budget year, so no entry disappears from the report", () => {
    expect(adjustmentProblem({ ...input, year: 2027 })).toBeNull();
    expect(adjustmentProblem({ ...input, year: 2028 })).toBe("year");
  });
  it("is Accounting's alone", () => {
    const org = new OrgTree([{ code: "FRM", parent: null }, { code: "FRM-FIN-ATM", parent: "FRM" }]);
    const allowed = (orgUnit: string) => ROLES.filter((r: Role) => can({ userId: "u", role: r, orgUnit, entities: ["*"] } as Actor, "actual.adjust", null, org));
    expect(allowed("FRM-FIN-ATM")).toEqual(["requestor", "default_owner", "division_owner"]);
    expect(allowed("FRM")).toEqual([]);
  });
});
