import { describe, expect, it } from "vitest";
import { dueDate, invoiceAmounts, invoiceNumber, invoiceProblem, invoiceStep, terminChangeProblem } from "../src/invoice";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import { can, type Actor, type Permission } from "../src/policy";
import { ROLES, type Role } from "../src/roles";

const amounts = (over: Partial<Parameters<typeof invoiceAmounts>[0]> = {}) => {
  const a = invoiceAmounts({ billed: money("577320000"), penalty: money("0"), fine: money("0"), wapu: false, pphRate: money("2"), ...over });
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.toString()]));
};

describe("invoiceAmounts (FC07_Finance; 42_Jadwal_Termin row 1)", () => {
  it("takes PPN 11% and PPh on the DPP, the invoice value being DPP plus PPN", () => {
    expect(amounts({ billed: money("86598000") })).toEqual({ dpp: "86598000", ppn: "9525780", pph: "1731960", total: "96123780", receivable: "94391820" });
  });
  it("takes penalty and fine off the billed amount first (BR-FIN-006)", () => {
    expect(amounts({ billed: money("1000"), penalty: money("100"), fine: money("50"), pphRate: money("0") })).toMatchObject({ dpp: "850", ppn: "93.5", total: "943.5" });
  });
  it("shows PPN to a Wapu customer without expecting to collect it (BR-FIN-001, client decision)", () => {
    expect(amounts({ billed: money("1000"), wapu: true })).toEqual({ dpp: "1000", ppn: "110", pph: "20", total: "1110", receivable: "980" });
  });
  it("rounds to the sen", () => {
    expect(amounts({ billed: money("100.05"), pphRate: money("2") })).toMatchObject({ ppn: "11.01", pph: "2" });
  });
});

describe("invoiceProblem", () => {
  const input = { billed: money("1000"), penalty: money("0"), fine: money("0"), pphRate: money("2"), pphType: "pph23" as const, invoicedOn: "2027-03-10", today: "2027-03-10" };
  it("needs a positive DPP, a sensible PPh rate and a date up to today", () => {
    expect(invoiceProblem(input)).toBeNull();
    expect(invoiceProblem({ ...input, penalty: money("1000") })).toBe("dpp");
    expect(invoiceProblem({ ...input, penalty: money("-1") })).toBe("deduction");
    expect(invoiceProblem({ ...input, pphRate: money("101") })).toBe("pph");
    expect(invoiceProblem({ ...input, pphType: "none" })).toBe("pph");
    expect(invoiceProblem({ ...input, invoicedOn: "2027-03-11" })).toBe("date");
  });
});

describe("dueDate and invoiceNumber", () => {
  it("adds the customer's term of payment, 30 days when none is recorded", () => {
    expect([dueDate("2027-01-15", 45), dueDate("2027-12-20", null)]).toEqual(["2027-03-01", "2028-01-19"]);
  });
  it("numbers INV/PT/YY/NNNN (19_Form_Field_Spec, client decision)", () => {
    expect(invoiceNumber("ESTRADA", "2027-03-10", 7)).toBe("INV/ESTRADA/27/0007");
  });
});

describe("invoiceStep: draft, validated, approved, issued (plan B1)", () => {
  const who = (actorId: string, over: Partial<Parameters<typeof invoiceStep>[2]> = {}) => ({ actorId, createdBy: "ar", validatedBy: "tax", mayCreate: false, mayApprove: false, note: "", ...over });
  it("goes through tax validation by someone other than the creator", () => {
    expect(invoiceStep("draft", "validate", who("tax", { mayCreate: true }))).toEqual({ to: "validated" });
    expect(invoiceStep("draft", "validate", who("ar", { mayCreate: true }))).toEqual({ problem: "own_invoice" });
    expect(invoiceStep("draft", "validate", who("x"))).toEqual({ problem: "not_allowed" });
  });
  it("is approved and issued by the approver, never the creator or the validator", () => {
    expect(invoiceStep("validated", "approve", who("head", { mayApprove: true }))).toEqual({ to: "approved" });
    expect(invoiceStep("approved", "issue", who("head", { mayApprove: true }))).toEqual({ to: "issued" });
    expect(invoiceStep("validated", "approve", who("tax", { mayApprove: true }))).toEqual({ problem: "own_invoice" });
    expect(invoiceStep("validated", "approve", who("ar", { mayApprove: true }))).toEqual({ problem: "own_invoice" });
    expect(invoiceStep("draft", "approve", who("head", { mayApprove: true }))).toEqual({ problem: "wrong_state" });
  });
  it("goes back to draft only with a note, and is cancelled only before approval", () => {
    expect(invoiceStep("validated", "return", who("head", { mayApprove: true }))).toEqual({ problem: "note_required" });
    expect(invoiceStep("approved", "return", who("head", { mayApprove: true, note: "Salah termin" }))).toEqual({ to: "draft" });
    expect(invoiceStep("draft", "cancel", who("ar", { mayCreate: true, note: "Dobel" }))).toEqual({ to: "cancelled" });
    expect(invoiceStep("approved", "cancel", who("ar", { mayCreate: true, note: "x" }))).toEqual({ problem: "wrong_state" });
    expect(invoiceStep("issued", "return", who("head", { mayApprove: true, note: "x" }))).toEqual({ problem: "wrong_state" });
  });
});

describe("terminChangeProblem: an invoiced termin stays as it was billed", () => {
  const billed = [{ no: 2, amount: money("500") }];
  it("refuses removing it or changing its amount", () => {
    expect(terminChangeProblem([{ no: 1, amount: money("100") }, { no: 2, amount: money("500") }], billed)).toBeNull();
    expect(terminChangeProblem([{ no: 1, amount: money("100") }], billed)).toBe(2);
    expect(terminChangeProblem([{ no: 2, amount: money("501") }], billed)).toBe(2);
  });
});

describe("who creates, approves and reads invoices (client decision)", () => {
  const org = new OrgTree([{ code: "FRM", parent: null }, { code: "FRM-FIN-ATM", parent: "FRM" }, { code: "BCD", parent: null }]);
  const allowed = (p: Permission, orgUnit: string) => ROLES.filter((r: Role) => can({ userId: "u", role: r, orgUnit, entities: ["*"] } as Actor, p, null, org));
  it("Accounting creates and validates; the FRM Division Owner approves", () => {
    expect(allowed("invoice.create", "FRM-FIN-ATM")).toEqual(["requestor", "default_owner", "division_owner"]);
    expect(allowed("invoice.create", "BCD")).toEqual([]);
    expect(allowed("invoice.approve", "FRM")).toEqual(["division_owner"]);
    expect(allowed("invoice.view", "FRM")).toEqual(["division_owner", "finance", "bfp", "cash_manager", "director", "auditor"]);
  });
});
