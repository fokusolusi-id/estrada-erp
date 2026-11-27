import { describe, expect, it } from "vitest";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import {
  bankConcentration, canConfirmRelease, drawingKindsFor, drawingProblem, drawingStatus, facilityPaymentProblem, facilityPosition, issueProblem, nextDueDate,
  obligoReminders, releaseProblem, type DrawingRequest,
} from "../src/obligo";
import { can, type Actor, type Permission } from "../src/policy";
import { ROLES, type Role } from "../src/roles";

const org = new OrgTree([{ code: "DIR", parent: null }, { code: "FRM", parent: "DIR" }, { code: "PMO", parent: "DIR" }, { code: "SCM", parent: "DIR" }]);
const actor = (role: Role, orgUnit: string, userId: string = role): Actor => ({ userId, role, orgUnit, entities: ["*"] });

describe("facilityPosition (BR-OBG-002, BR-OBG-006)", () => {
  it("counts loans less principal repaid, and guarantees until released", () => {
    const p = facilityPosition(money("100"), [
      { id: "a", kind: "loan", state: "issued", amount: money("40") },
      { id: "b", kind: "bg", state: "issued", amount: money("30") },
      { id: "c", kind: "bg", state: "released", amount: money("30") },
      { id: "d", kind: "loan", state: "requested", amount: money("50") },
    ], [{ drawingId: "a", principal: money("15") }]);
    expect([p.outstanding.toString(), p.available.toString()]).toEqual(["55", "45"]);
  });
  it("names each drawing's status", () => {
    const d = { kind: "bg" as const, state: "issued" as const, dueOn: "2027-01-31" };
    expect(drawingStatus(d, money("1"), "2027-01-31")).toBe("active");
    expect(drawingStatus(d, money("1"), "2027-02-01")).toBe("expired");
    expect(drawingStatus({ ...d, kind: "loan" }, money("0"), "2027-02-01")).toBe("repaid");
    expect(drawingStatus({ ...d, state: "requested" }, money("0"), "2027-02-01")).toBe("requested");
  });
});

const ok: DrawingRequest = { facility: { type: "kmk", active: true, expiresOn: null }, kind: "bg", bgType: "performance", amount: money("10"), available: money("10"), projectId: "p", underlying: "KL 12/2027", hasDocument: true, today: "2027-01-01" };

describe("drawingProblem (FC08 rules; BR-OBG-002, 003, 007)", () => {
  it("accepts a complete request up to the plafon left", () => expect(drawingProblem(ok)).toBeNull());
  it("blocks what the rules block", () => {
    const of = (over: Partial<DrawingRequest>) => drawingProblem({ ...ok, ...over });
    expect(of({ amount: money("10.01") })).toBe("plafon");
    expect(of({ amount: money("0") })).toBe("amount");
    expect(of({ projectId: null })).toBe("project");
    expect(of({ kind: "loan", projectId: null, bgType: null })).toBeNull();
    expect(of({ bgType: null })).toBe("bg_type");
    expect(of({ underlying: " " })).toBe("underlying");
    expect(of({ hasDocument: false })).toBe("document");
    expect(of({ facility: { type: "kmk", active: false, expiresOn: null } })).toBe("closed");
    expect(of({ facility: { type: "kmk", active: true, expiresOn: "2026-12-31" } })).toBe("closed");
    expect(of({ facility: { type: "bg", active: true, expiresOn: null }, kind: "loan" })).toBe("kind");
  });
  it("knows what each facility type issues", () => {
    expect([drawingKindsFor("bg"), drawingKindsFor("kmk"), drawingKindsFor("ki"), drawingKindsFor("trade_line")]).toEqual([["bg"], ["loan", "bg"], ["loan"], ["loan", "bg"]]);
  });
});

describe("issue, release and payment", () => {
  const issue = { state: "requested" as const, requestedBy: "pm", actorId: "cm", reference: "BG-1", issuedOn: "2027-01-01", dueOn: "2027-06-30", today: "2027-01-01", amount: money("5"), available: money("5") };
  it("is approved by someone else, with the bank's number and dates, within the plafon", () => {
    expect(issueProblem(issue)).toBeNull();
    expect(issueProblem({ ...issue, actorId: "pm" })).toBe("own_request");
    expect(issueProblem({ ...issue, reference: " " })).toBe("reference");
    expect(issueProblem({ ...issue, issuedOn: "2027-01-02" })).toBe("issued_on");
    expect(issueProblem({ ...issue, dueOn: "2026-12-31" })).toBe("due_on");
    expect(issueProblem({ ...issue, available: money("4") })).toBe("plafon");
    expect(issueProblem({ ...issue, state: "issued" })).toBe("state");
  });
  it("releases a guarantee only after the PM's confirmation", () => {
    expect(releaseProblem({ kind: "bg", state: "issued", confirmed: false })).toBe("unconfirmed");
    expect(releaseProblem({ kind: "bg", state: "issued", confirmed: true })).toBeNull();
    expect(releaseProblem({ kind: "loan", state: "issued", confirmed: true })).toBe("state");
  });
  it("lets the project's PM confirm, or the PMO head when none is assigned", () => {
    expect(canConfirmRelease(actor("requestor", "PMO", "pm1"), "pm1", org)).toBe(true);
    expect(canConfirmRelease(actor("division_owner", "PMO", "head"), "pm1", org)).toBe(false);
    expect(canConfirmRelease(actor("division_owner", "PMO", "head"), null, org)).toBe(true);
    expect(canConfirmRelease(actor("requestor", "PMO", "x"), null, org)).toBe(false);
  });
  it("takes principal up to what is owed, and interest", () => {
    const p = { principal: money("5"), interest: money("1"), owed: money("5"), paidOn: "2027-01-01", today: "2027-01-01" };
    expect(facilityPaymentProblem(p)).toBeNull();
    expect(facilityPaymentProblem({ ...p, principal: money("6") })).toBe("over");
    expect(facilityPaymentProblem({ ...p, principal: money("0"), interest: money("0") })).toBe("amount");
    expect(facilityPaymentProblem({ ...p, owed: null })).toBe("drawing");
    expect(facilityPaymentProblem({ ...p, principal: money("0"), owed: null })).toBeNull();
    expect(facilityPaymentProblem({ ...p, paidOn: "2027-01-02" })).toBe("date");
  });
});

describe("alerts (BR-OBG-001, 005, 009)", () => {
  it("flags a bank holding more than half of the plafon", () => {
    expect(bankConcentration([{ bank: "Mandiri", plafon: money("80") }, { bank: "BRI", plafon: money("50") }, { bank: "BCA", plafon: money("5.24") }]).map((b) => [b.bank, b.share.toFixed(0)])).toEqual([["Mandiri", "59"]]);
    expect(bankConcentration([{ bank: "A", plafon: money("50") }, { bank: "B", plafon: money("50") }])).toEqual([]);
  });
  it("finds the next interest date", () => {
    expect([nextDueDate(15, "2027-01-15"), nextDueDate(3, "2027-01-04"), nextDueDate(25, "2027-12-26"), nextDueDate(31, "2027-02-01")]).toEqual(["2027-01-15", "2027-02-03", "2028-01-25", "2027-02-28"]);
  });
  it("reminds 30 days before expiry and 7 days before interest, once per date", () => {
    const facilities = [{ id: "f", expiresOn: "2027-01-31", interestDay: 8, owes: true }, { id: "g", expiresOn: "2027-02-02", interestDay: 15, owes: false }];
    const guarantees = [{ id: "d", dueOn: "2027-01-20" }, { id: "old", dueOn: "2026-12-31" }];
    expect(obligoReminders("2027-01-01", facilities, guarantees).map((r) => r.key)).toEqual(["facility_expiry:f:2027-01-31", "interest_due:f:2027-01-08", "bg_expiry:d:2027-01-20"]);
  });
});

describe("who", () => {
  const allowed = (p: Permission, unit: string) => ROLES.filter((r) => can({ userId: "u", role: r, orgUnit: unit, entities: ["*"] }, p, null, org));
  it("lets PMO and Finance request, Cash Management approve (sheet FC08_Obligo_Bank)", () => {
    expect(allowed("obligo.request", "PMO")).toEqual(["requestor", "default_owner", "division_owner", "finance"]);
    expect(allowed("obligo.request", "SCM")).toEqual(["finance"]);
    expect(allowed("obligo.manage", "FRM")).toEqual(["cash_manager"]);
    expect(allowed("obligo.view", "FRM")).toEqual(["division_owner", "finance", "cash_manager", "director", "auditor"]);
  });
});
