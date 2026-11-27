import { describe, expect, it } from "vitest";
import { cashEntryProblem, costClass, isIndirectReceipt, weekOf, weeklyCashflow, type CashEvent } from "../src/cash-week";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import { can, type Actor, type Permission } from "../src/policy";
import { ROLES, type Role } from "../src/roles";

describe("weekOf (BR-CF-001, client decision: 1-7, 8-14, 15-21, 22-end)", () => {
  it("splits every month into four weeks", () => {
    expect([1, 7, 8, 14, 15, 21, 22, 28, 31].map((d) => weekOf(`2027-01-${String(d).padStart(2, "0")}`))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 4]);
  });
});

describe("costClass (FC07 addendum 1: direct 5100-5900, OPEX 6100-6420)", () => {
  it("reads the account number", () => {
    expect(["5110", "5900", "6110", "6420", "7221", "1521", "5100-1"].map(costClass)).toEqual(["direct", "direct", "opex", "opex", "other", "other", "direct"]);
    expect(costClass(null)).toBe("other");
  });
});

describe("isIndirectReceipt (client decision: via Telkom when the end customer differs)", () => {
  it("is indirect only for a Telkom company billing for someone else", () => {
    expect(isIndirectReceipt("PT Telkom Indonesia", "Korlantas")).toBe(true);
    expect(isIndirectReceipt("PT Telkom Satelit Indonesia", "Kemendagri")).toBe(true);
    expect(isIndirectReceipt("PT Telkom Indonesia", "Telkom")).toBe(false);
    expect(isIndirectReceipt("PT Telkom Indonesia", null)).toBe(false);
    expect(isIndirectReceipt("PT XL Smart", "Korlantas")).toBe(false);
  });
});

describe("weeklyCashflow (BR-CF-001..003)", () => {
  const openings = new Map([["ESTRADA", money("1000")], ["MATRIK", money("500")]]);
  const ev = (entity: string, date: string, kind: CashEvent["kind"], amount: string, coaCode: string | null = null): CashEvent => ({ entity, date, kind, amount: money(amount), coaCode });
  const events = [
    ev("ESTRADA", "2027-01-05", "in_direct", "100"),
    ev("ESTRADA", "2027-02-02", "in_indirect", "200"),
    ev("ESTRADA", "2027-02-03", "loan_in", "50"),
    ev("ESTRADA", "2027-02-10", "payment", "30", "5110"),
    ev("ESTRADA", "2027-02-11", "payment", "20", "5110"),
    ev("ESTRADA", "2027-02-16", "payment", "10", "6241"),
    ev("ESTRADA", "2027-02-23", "interest", "5"),
    ev("ESTRADA", "2027-02-23", "repayment", "15"),
    ev("MATRIK", "2027-02-01", "in_direct", "7"),
    ev("ESTRADA", "2026-12-30", "in_direct", "9999"),
  ];
  const feb = weeklyCashflow(openings, events, { year: 2027, month: 2, entities: ["ESTRADA"] });

  it("carries the ending cash of earlier weeks into the month", () => {
    expect(feb.weeks.map((w) => w.opening.toString())).toEqual(["1100", "1350", "1300", "1290"]);
  });
  it("adds cash in and loans to what is available, and ends after every cash out", () => {
    const w1 = feb.weeks[0]!;
    expect([w1.inIndirect.toString(), w1.loanIn.toString(), w1.available.toString(), w1.ending.toString()]).toEqual(["200", "50", "1350", "1350"]);
    expect([feb.total.opening.toString(), feb.total.direct.toString(), feb.total.opex.toString(), feb.total.interest.toString(), feb.total.repayment.toString(), feb.total.ending.toString()]).toEqual(["1100", "50", "10", "5", "15", "1270"]);
  });
  it("details cash out per account", () => {
    expect(feb.accounts.map((a) => [a.coaCode, a.class, a.weeks.map(String).join(","), a.total.toString()])).toEqual([
      ["5110", "direct", "0,50,0,0", "50"],
      ["6241", "opex", "0,0,10,0", "10"],
    ]);
  });
  it("consolidates the chosen companies as the sum of each", () => {
    const both = weeklyCashflow(openings, events, { year: 2027, month: 2, entities: ["ESTRADA", "MATRIK"] });
    const matrik = weeklyCashflow(openings, events, { year: 2027, month: 2, entities: ["MATRIK"] });
    expect(both.total.ending.toString()).toBe(feb.total.ending.plus(matrik.total.ending).toString());
  });
});

describe("manual cash entries", () => {
  const input = { amount: money("10"), date: "2027-02-01", today: "2027-02-01", description: "Setoran pemilik", kind: "other_in" as const, coaCode: null };
  it("needs a positive amount, a date up to today, a description, and an account for a cost", () => {
    expect(cashEntryProblem(input)).toBeNull();
    expect(cashEntryProblem({ ...input, amount: money("0") })).toBe("amount");
    expect(cashEntryProblem({ ...input, date: "2027-02-02" })).toBe("date");
    expect(cashEntryProblem({ ...input, description: "x" })).toBe("description");
    expect(cashEntryProblem({ ...input, kind: "cost" })).toBe("account");
  });
  it("are Cash Management's; Finance, Direktur, Auditor and the CFO read", () => {
    const org = new OrgTree([{ code: "FRM", parent: null }]);
    const allowed = (p: Permission) => ROLES.filter((r: Role) => can({ userId: "u", role: r, orgUnit: "FRM", entities: ["*"] } as Actor, p, null, org));
    expect(allowed("cash.record")).toEqual(["cash_manager"]);
    expect(allowed("cash.view")).toEqual(["division_owner", "finance", "cash_manager", "director", "auditor"]);
  });
});
