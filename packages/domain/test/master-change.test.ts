import { describe, expect, it } from "vitest";
import { changeStep, requestProblem, isDue } from "../src/master-change";
import { OrgTree } from "../src/org";
import { can, type Actor } from "../src/policy";
import { ROLES, type Role } from "../src/roles";

const TODAY = "2026-11-27";
const approver = { actorId: "head-frm", requesterId: "finance-1", mayApprove: true };

describe("requestProblem (FC12_Master_Data, data fields)", () => {
  it("needs a reason", () => {
    expect(requestProblem({ reason: "  ", effectiveOn: TODAY }, TODAY)).toBe("reason_required");
  });
  it("takes an effective date from today on; a later date is allowed", () => {
    expect(requestProblem({ reason: "Akun baru", effectiveOn: "2026-11-26" }, TODAY)).toBe("effective_past");
    expect(requestProblem({ reason: "Akun baru", effectiveOn: "27/11/2026" }, TODAY)).toBe("effective_invalid");
    expect(requestProblem({ reason: "Akun baru", effectiveOn: "2026-13-01" }, TODAY)).toBe("effective_invalid");
    expect(requestProblem({ reason: "Akun baru", effectiveOn: TODAY }, TODAY)).toBeNull();
    expect(requestProblem({ reason: "Akun baru", effectiveOn: "2027-01-01" }, TODAY)).toBeNull();
  });
});

describe("changeStep (FC12 steps 3-4, SoD: requester != approver)", () => {
  it("lets the approver approve or reject a pending request", () => {
    expect(changeStep("pending", "approve", approver)).toEqual({ to: "approved" });
    expect(changeStep("pending", "reject", { ...approver, note: "Kode ganda" })).toEqual({ to: "rejected" });
  });
  it("never lets the requester decide their own request", () => {
    expect(changeStep("pending", "approve", { ...approver, actorId: "finance-1" })).toEqual({ problem: "own_request" });
    expect(changeStep("pending", "reject", { ...approver, actorId: "finance-1", note: "x" })).toEqual({ problem: "own_request" });
  });
  it("refuses a decision by anyone else, and a rejection without a note", () => {
    expect(changeStep("pending", "approve", { ...approver, mayApprove: false })).toEqual({ problem: "not_approver" });
    expect(changeStep("pending", "reject", approver)).toEqual({ problem: "note_required" });
  });
  it("lets only the requester cancel, while nothing is applied yet", () => {
    expect(changeStep("pending", "cancel", { ...approver, actorId: "finance-1" })).toEqual({ to: "cancelled" });
    expect(changeStep("approved", "cancel", { ...approver, actorId: "finance-1" })).toEqual({ to: "cancelled" });
    expect(changeStep("pending", "cancel", approver)).toEqual({ problem: "not_requester" });
  });
  it("decides a request once", () => {
    for (const from of ["approved", "applied", "rejected", "cancelled", "failed"] as const) expect(changeStep(from, "approve", approver)).toEqual({ problem: "wrong_state" });
    expect(changeStep("applied", "cancel", { ...approver, actorId: "finance-1" })).toEqual({ problem: "wrong_state" });
  });
  it("applies on the effective date", () => {
    expect(isDue(TODAY, TODAY)).toBe(true);
    expect(isDue("2026-11-28", TODAY)).toBe(false);
  });
});

describe("master.approve: the Finance Controller is the FRM Division Owner (client decision)", () => {
  const org = new OrgTree([{ code: "DIR", parent: null }, { code: "FRM", parent: "DIR" }, { code: "BCD", parent: "DIR" }]);
  const actor = (role: Role, orgUnit: string): Actor => ({ userId: "u", role, orgUnit, entities: ["*"] });
  it("allows that seat alone", () => {
    expect(ROLES.filter((r) => can(actor(r, "FRM"), "master.approve", null, org))).toEqual(["division_owner"]);
    expect(can(actor("division_owner", "BCD"), "master.approve", null, org)).toBe(false);
  });
  it("shows the requests to the approver, Finance, Admin, Direktur and Auditor", () => {
    expect(ROLES.filter((r) => can(actor(r, "FRM"), "master.requests", null, org))).toEqual(["division_owner", "finance", "director", "auditor", "admin"]);
  });
});
