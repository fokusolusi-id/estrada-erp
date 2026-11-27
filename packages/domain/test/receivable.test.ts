import { describe, expect, it } from "vitest";
import { agingBucket, agingByCustomer, cashInForecast, outstandingOf, receiptProblem, reviewList } from "../src/receivable";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import { can, type Actor } from "../src/policy";
import { ROLES, type Role } from "../src/roles";

const invoice = { total: money("1110"), receivable: money("1090"), invoicedOn: "2027-01-10", createdBy: "ar", validatedBy: "tax", approvedBy: "head" };

describe("outstandingOf", () => {
  it("is what is still expected: receivable less receipts, never below zero", () => {
    expect([outstandingOf(invoice, money("0")), outstandingOf(invoice, money("90")), outstandingOf(invoice, money("1110"))].map(String)).toEqual(["1090", "1000", "0"]);
  });
});

describe("receiptProblem (FC07_Finance: Nilai Bayar <= Nilai Invoice; SoD)", () => {
  const ok = { amount: money("1090"), received: money("0"), receivedOn: "2027-02-01", today: "2027-02-01", actorId: "cash", state: "issued" as const };
  const check = (over: Partial<typeof ok>) => receiptProblem(invoice, { ...ok, ...over });

  it("takes a positive amount up to the invoice value, all receipts together", () => {
    expect(check({})).toBeNull();
    expect(check({ amount: money("1110") })).toBeNull();
    expect(check({ amount: money("1110.01") })).toBe("over");
    expect(check({ amount: money("111"), received: money("1000") })).toBe("over");
    expect(check({ amount: money("0") })).toBe("amount");
  });
  it("dates it between the invoice date and today", () => {
    expect(check({ receivedOn: "2027-01-09" })).toBe("date");
    expect(check({ receivedOn: "2027-02-02" })).toBe("date");
  });
  it("only on an issued invoice, and not by whoever made, validated or approved it", () => {
    expect(check({ state: "approved" as never })).toBe("not_issued");
    for (const actorId of ["ar", "tax", "head"]) expect(check({ actorId })).toBe("own_invoice");
  });
});

describe("agingBucket (P1_Module_Spec P1-M2: Current, 1-30, 31-60, 61-90, >90)", () => {
  it("counts days past the due date", () => {
    const at = (due: string) => agingBucket(due, "2027-05-01");
    expect(["2027-05-01", "2027-06-01", "2027-04-30", "2027-04-01", "2027-03-31", "2027-03-02", "2027-03-01", "2027-01-31", "2027-01-30"].map(at)).toEqual([
      "current", "current", "d30", "d30", "d60", "d60", "d90", "d90", "over90",
    ]);
  });
});

const open = [
  { id: "1", customer: "Telkom", number: "A", dueOn: "2027-05-20", outstanding: money("100") },
  { id: "2", customer: "Telkom", number: "B", dueOn: "2027-03-15", outstanding: money("200") },
  { id: "3", customer: "XL", number: "C", dueOn: "2027-05-05", outstanding: money("50") },
  { id: "4", customer: "XL", number: "D", dueOn: "2027-01-01", outstanding: money("0") },
];

describe("agingByCustomer", () => {
  it("adds what each customer owes per bucket, biggest first, paid invoices left out", () => {
    const rows = agingByCustomer(open, "2027-05-01");
    expect(rows.map((r) => [r.customer, r.total.toString(), r.buckets.current.toString(), r.buckets.d60.toString()])).toEqual([["Telkom", "300", "100", "200"], ["XL", "50", "50", "0"]]);
  });
});

describe("reviewList (FC07_Finance: weekly AR review)", () => {
  it("lists what is overdue or falls due within seven days, oldest first", () => {
    expect(reviewList(open, "2027-05-01").map((r) => [r.number, r.daysOverdue])).toEqual([["B", 47], ["C", -4]]);
  });
});

describe("cashInForecast (BR-FIN-002: twelve months of expected cash-in)", () => {
  it("spreads open invoices and unbilled termin by month, late ones into the first", () => {
    const rows = cashInForecast([{ on: "2027-03-15", amount: money("200") }], [{ on: "2027-06-30", amount: money("500") }, { on: "2029-01-01", amount: money("9") }], "2027-05-01");
    expect(rows).toHaveLength(12);
    expect([rows[0]!.month, rows[0]!.invoiced.toString(), rows[1]!.planned.toString(), rows[11]!.month]).toEqual(["2027-05", "200", "500", "2028-04"]);
  });
});

describe("receipt.record (FC07_Finance step 7: Cash Management)", () => {
  it("is Cash Management's", () => {
    const org = new OrgTree([{ code: "FRM", parent: null }]);
    expect(ROLES.filter((r: Role) => can({ userId: "u", role: r, orgUnit: "FRM", entities: ["*"] } as Actor, "receipt.record", null, org))).toEqual(["cash_manager"]);
  });
});
