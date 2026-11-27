import { describe, expect, it } from "vitest";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import { can, type Actor, type Permission } from "../src/policy";
import { ROLES } from "../src/roles";
import { bupotNeeded, taxDocumentProblem, taxLate, taxPeriodOf, taxReport, type TaxItem } from "../src/tax";

const item = (over: Partial<TaxItem> = {}): TaxItem => ({
  kind: "faktur_out", entity: "ESTRADA", baseDate: "2027-01-10", dpp: money("100"), amount: money("11"), wapu: false, pphType: null, document: null, ...over,
});
const doc = (status: "recorded" | "uploaded" | "approved" | "rejected", date = "2027-01-12") => ({ number: "010.000-27.00000001", date, status });

describe("taxPeriodOf", () => {
  it("is the faktur's month, or the source's while there is none", () => {
    expect(taxPeriodOf(item())).toBe("2027-01");
    expect(taxPeriodOf(item({ document: doc("recorded", "2027-02-01") }))).toBe("2027-02");
  });
});

describe("taxLate (P1-M11: not uploaded after 7 days)", () => {
  it("flags our faktur and bukti potong until uploaded", () => {
    expect(taxLate(item(), "2027-01-17")).toBe(false);
    expect(taxLate(item(), "2027-01-18")).toBe(true);
    expect(taxLate(item({ document: doc("recorded") }), "2027-01-18")).toBe(true);
    expect(taxLate(item({ document: doc("rejected") }), "2027-01-18")).toBe(true);
    expect(taxLate(item({ document: doc("uploaded") }), "2027-03-01")).toBe(false);
    expect(taxLate(item({ kind: "bupot" }), "2027-01-18")).toBe(true);
  });
  it("asks only that the vendor's faktur be recorded", () => {
    expect(taxLate(item({ kind: "faktur_in" }), "2027-01-18")).toBe(true);
    expect(taxLate(item({ kind: "faktur_in", document: doc("recorded") }), "2027-03-01")).toBe(false);
  });
});

describe("taxDocumentProblem", () => {
  const ok = { number: "010.000-27.00000001", date: "2027-01-12", status: "recorded" as const, today: "2027-01-12" };
  it("needs a number and a date up to today", () => {
    expect(taxDocumentProblem(ok)).toBeNull();
    expect(taxDocumentProblem({ ...ok, number: "12" })).toBe("number");
    expect(taxDocumentProblem({ ...ok, date: "2027-01-13" })).toBe("date");
  });
});

describe("taxReport (monthly SPT figures, P1-M11)", () => {
  const items = [
    item(),
    item({ wapu: true, amount: money("22") }),
    item({ kind: "faktur_in", amount: money("5"), document: doc("recorded") }),
    item({ kind: "faktur_in", amount: money("3") }),
    item({ kind: "bupot", amount: money("2"), pphType: "pph23" }),
    item({ kind: "bupot", amount: money("4"), pphType: "pph42" }),
    item({ kind: "bupot", amount: money("1"), pphType: null }),
    item({ baseDate: "2027-02-01", amount: money("99") }),
    item({ entity: "MATRIK", amount: money("7") }),
  ];
  const r = taxReport(items, { period: "2027-01", entities: ["ESTRADA"], pph21: money("8"), withheldFromUs: money("6") });
  it("nets our PPN against the vendor faktur recorded, leaving Wapu to the buyer", () => {
    expect([r.ppnOut, r.ppnWapu, r.ppnIn, r.ppnInUnrecorded, r.ppnDue].map(String)).toEqual(["11", "22", "5", "3", "6"]);
  });
  it("totals what we withheld by type, PPh 21 as typed, and what customers withheld", () => {
    expect(r.withheld.map((w) => [w.type, w.amount.toString()])).toEqual([["pph23", "2"], ["pph42", "4"], [null, "1"]]);
    expect([r.pph21, r.pphDue, r.withheldFromUs].map(String)).toEqual(["8", "15", "6"]);
  });
  it("needs a bukti potong only where PPh was withheld", () => expect([bupotNeeded(money("0")), bupotNeeded(money("1"))]).toEqual([false, true]));
});

describe("who", () => {
  const org = new OrgTree([{ code: "FRM", parent: null }, { code: "FRM-FIN-ATM", parent: "FRM" }]);
  const allowed = (p: Permission, unit: string) => ROLES.filter((role) => can({ userId: "u", role, orgUnit: unit, entities: ["*"] } as Actor, p, null, org));
  it("is Accounting's to record; Finance, Direktur, Auditor and the CFO read", () => {
    expect(allowed("tax.record", "FRM-FIN-ATM")).toEqual(["requestor", "default_owner", "division_owner"]);
    expect(allowed("tax.record", "FRM")).toEqual([]);
    expect(allowed("tax.view", "FRM")).toEqual(["division_owner", "finance", "director", "auditor"]);
  });
});
