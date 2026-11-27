import { describe, expect, it } from "vitest";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import { approvalSteps, limitFor, paysOwnRequest, paymentActions, paymentNotice, paymentRecipients, paymentTransition, type PaymentRequestLike, type PaymentSeat } from "../src/payment";
import type { Actor } from "../src/policy";
import type { Role } from "../src/roles";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "FRM", parent: "DIR", type: "division" },
  { code: "FRM-FIN", parent: "FRM" },
  { code: "PDMS", parent: "DIR", type: "division" },
  { code: "SCM", parent: "PDMS" },
]);
const actor = (userId: string, role: Role, orgUnit: string): Actor => ({ userId, role, orgUnit, entities: ["*"] });
const pdmsHead = actor("pdms", "division_owner", "PDMS");
const frmHead = actor("frm", "division_owner", "FRM");
const director = actor("dir", "director", "DIR");
const bfp = actor("bfp", "bfp", "FRM");
const req = (over: Partial<PaymentRequestLike> = {}): PaymentRequestLike => ({ state: "under_review", requesterId: "staff", requesterUnit: "SCM", requesterRole: "requestor", entity: "ESTRADA", ...over });
const next = (r: PaymentRequestLike, who: Actor) => paymentTransition(r, { action: r.state === "under_review" ? "verify" : "approve", actor: who }, org).to;

describe("limitFor (33_Master_CostCenter)", () => {
  const limits = new Map([["PDMS", money("1000")], ["SCM", money("2000")]]);
  it("takes the nearest cost center above the requester that has a limit", () => {
    expect(limitFor("SCM", limits, org)?.toString()).toBe("2000");
    expect(limitFor("PDMS", limits, org)?.toString()).toBe("1000");
    expect(limitFor("FRM-FIN", limits, org)).toBeNull();
  });
});

describe("approval above the cost center's limit (client decision: FRM head, then Direktur)", () => {
  it("keeps the one approval within the limit", () => {
    expect(next(req(), bfp)).toBe("pending_approval");
    expect(next(req({ state: "pending_approval" }), pdmsHead)).toBe("approved");
  });
  it("goes Head Divisi, FRM head, Direktur", () => {
    const over = { overLimit: true };
    expect(next(req(over), bfp)).toBe("pending_approval");
    expect(next(req({ ...over, state: "pending_approval" }), pdmsHead)).toBe("frm_approval");
    expect(next(req({ ...over, state: "frm_approval" }), frmHead)).toBe("director_approval");
    expect(next(req({ ...over, state: "director_approval" }), director)).toBe("approved");
  });
  it("does not ask the FRM head twice for FRM's own request", () => {
    const frm = { overLimit: true, requesterUnit: "FRM-FIN" };
    expect(next(req(frm), bfp)).toBe("frm_approval");
    expect(next(req({ ...frm, state: "frm_approval" }), frmHead)).toBe("director_approval");
  });
  it("skips the FRM step when the FRM head asked", () => {
    expect(next(req({ overLimit: true, requesterUnit: "FRM", requesterRole: "division_owner", requesterId: "frm" }), bfp)).toBe("director_approval");
  });
  it("lets the Direktur decide once when they would have been the Head Divisi too", () => {
    expect(next(req({ overLimit: true, requesterUnit: "PDMS", requesterRole: "division_owner", requesterId: "pdms" }), bfp)).toBe("frm_approval");
  });
  it("lists the approvals a request will pass, for the stepper", () => {
    expect(approvalSteps(req(), org)).toEqual(["pending_approval"]);
    expect(approvalSteps(req({ overLimit: true }), org)).toEqual(["pending_approval", "frm_approval", "director_approval"]);
    expect(approvalSteps(req({ overLimit: true, requesterUnit: "FRM-FIN" }), org)).toEqual(["frm_approval", "director_approval"]);
  });
  it("gives each step to its own person, who may return it", () => {
    expect(paymentActions(frmHead, req({ state: "frm_approval" }), org)).toEqual(["approve", "return"]);
    expect(paymentActions(director, req({ state: "frm_approval" }), org)).toEqual([]);
    expect(paymentActions(director, req({ state: "director_approval" }), org)).toEqual(["approve", "return"]);
    expect(paymentActions(frmHead, req({ state: "director_approval" }), org)).toEqual([]);
    expect(paymentActions(frmHead, req({ state: "frm_approval", requesterId: "frm" }), org)).toEqual([]);
  });
  it("tells the next approver", () => {
    const seats: PaymentSeat[] = [
      { orgUnit: "FRM", role: "division_owner", occupant: "frm", entities: ["*"] },
      { orgUnit: "DIR", role: "director", occupant: "dir", entities: ["*"] },
    ];
    expect(paymentNotice({ from: "pending_approval", to: "frm_approval", action: "approve" })).toEqual({ template: "payment_approval", to: "frm_head" });
    expect(paymentNotice({ from: "frm_approval", to: "director_approval", action: "approve" })).toEqual({ template: "payment_approval", to: "director" });
    expect(paymentRecipients("frm_head", req(), seats, org)).toEqual(["frm"]);
    expect(paymentRecipients("director", req(), seats, org)).toEqual(["dir"]);
  });
});

describe("paying one's own request (client decision: warn only)", () => {
  it("is noted on scheduling and paying", () => {
    expect(paysOwnRequest("schedule", "u", { requesterId: "u" })).toBe(true);
    expect(paysOwnRequest("pay", "u", { requesterId: "u" })).toBe(true);
    expect(paysOwnRequest("pay", "u", { requesterId: "x" })).toBe(false);
    expect(paysOwnRequest("submit", "u", { requesterId: "u" })).toBe(false);
  });
});
