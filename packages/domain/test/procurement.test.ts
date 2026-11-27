import { describe, expect, it } from "vitest";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import {
  canCheckBudget, canRequestPurchase, canWritePo, goodsReceiptProblem, matchProblem, openCommitment, poActions, poNumber, poProblem, poStep, prNumber, type PoLike,
} from "../src/procurement";
import type { Role } from "../src/roles";

const org = new OrgTree([{ code: "DIR", parent: null }, { code: "FRM", parent: "DIR" }, { code: "PDMS", parent: "DIR" }, { code: "PMO", parent: "PDMS" }, { code: "SCM", parent: "PDMS" }]);
const who = (userId: string, role: Role, orgUnit: string, entities = ["*"]): Actor => ({ userId, role, orgUnit, entities });
const pm = who("pm", "requestor", "PMO");
const buyer = who("buyer", "requestor", "SCM");
const scmHead = who("scm", "default_owner", "SCM");
const pdmsHead = who("pdms", "division_owner", "PDMS");
const frm = who("frm", "division_owner", "FRM");
const director = who("dir", "director", "DIR");
const po: PoLike = { state: "head", entity: "ESTRADA", createdBy: "buyer", requestedBy: "pm", createdByScmHead: false, overLimit: false };

describe("numbers (BR-SCM-001)", () => {
  it("runs per company and month", () => {
    expect(poNumber("ESTRADA", "2027-03-05", 7)).toBe("007/ESTRADA-PO/03/2027");
    expect(prNumber("ESTRADA", "2027-03-05", 12)).toBe("PR/ESTRADA/27/0012");
  });
});

describe("who (sheet FC05_SCM_Pengadaan SoD: requester != PO creator != approver)", () => {
  it("PM or PMO requests, BFP or Finance checks the budget, SCM orders", () => {
    expect(canRequestPurchase(pm, { entity: "ESTRADA", pm: null }, org)).toBe(true);
    expect(canRequestPurchase(who("x", "requestor", "SCM"), { entity: "ESTRADA", pm: "x" }, org)).toBe(true);
    expect(canRequestPurchase(buyer, { entity: "ESTRADA", pm: null }, org)).toBe(false);
    expect(canCheckBudget(who("b", "bfp", "FRM"), { entity: "ESTRADA", createdBy: "pm" })).toBe(true);
    expect(canCheckBudget(who("pm", "finance", "FRM"), { entity: "ESTRADA", createdBy: "pm" })).toBe(false);
    expect(canWritePo(buyer, "ESTRADA", org)).toBe(true);
    expect(canWritePo(who("m", "requestor", "SCM", ["MATRIK"]), "ESTRADA", org)).toBe(false);
  });
});

describe("PO approval (client decision: SCM head, then FRM head and Direktur above the limit)", () => {
  it("ends at the SCM head within the limit", () => {
    expect(poStep(po, "approve", scmHead, org, "")).toEqual({ to: "approved" });
    expect(poActions(po, pdmsHead, org)).toEqual([]);
  });
  it("goes on to FRM and the Direktur above it", () => {
    const over = { ...po, overLimit: true };
    expect(poStep(over, "approve", scmHead, org, "")).toEqual({ to: "frm" });
    expect(poStep({ ...over, state: "frm" }, "approve", frm, org, "")).toEqual({ to: "director" });
    expect(poStep({ ...over, state: "director" }, "approve", director, org, "")).toEqual({ to: "approved" });
  });
  it("goes to the PDMS head when the SCM head wrote it, and never to the writer or requester", () => {
    const own = { ...po, createdBy: "scm", createdByScmHead: true };
    expect(poActions(own, scmHead, org)).toEqual(["cancel"]);
    expect(poStep(own, "approve", pdmsHead, org, "")).toEqual({ to: "approved" });
    expect(poActions({ ...po, requestedBy: "scm" }, scmHead, org)).toEqual(["cancel"]);
  });
  it("returns or cancels with a note", () => {
    expect(poStep(po, "return", scmHead, org, "")).toEqual({ problem: "note_required" });
    expect(poStep(po, "return", scmHead, org, "harga")).toEqual({ to: "returned" });
    expect(poActions({ ...po, state: "returned" }, buyer, org)).toEqual(["resubmit", "cancel"]);
    expect(poStep({ ...po, state: "approved" }, "cancel", buyer, org, "batal")).toEqual({ to: "cancelled" });
    expect(poStep({ ...po, state: "approved", received: true }, "cancel", buyer, org, "batal")).toEqual({ problem: "not_allowed" });
  });
});

describe("figures", () => {
  it("keeps orders within the request (BR-SCM-003)", () => {
    const ok = { qty: money("2"), unitPrice: money("50"), estimate: money("100"), ordered: money("0"), date: "2027-01-01", today: "2027-01-01" };
    expect(poProblem(ok)).toBeNull();
    expect(poProblem({ ...ok, qty: money("0") })).toBe("qty");
    expect(poProblem({ ...ok, unitPrice: money("0") })).toBe("price");
    expect(poProblem({ ...ok, ordered: money("1") })).toBe("over_request");
    expect(poProblem({ ...ok, date: "2027-01-02" })).toBe("date");
  });
  it("receives after the PO, up to its value, by someone other than its writer", () => {
    const ok = { state: "approved" as const, amount: money("40"), received: money("60"), poAmount: money("100"), receivedOn: "2027-02-01", poDate: "2027-01-01", today: "2027-02-01", actorId: "pm", createdBy: "buyer" };
    expect(goodsReceiptProblem(ok)).toBeNull();
    expect(goodsReceiptProblem({ ...ok, state: "head" })).toBe("state");
    expect(goodsReceiptProblem({ ...ok, actorId: "buyer" })).toBe("own");
    expect(goodsReceiptProblem({ ...ok, amount: money("41") })).toBe("over");
    expect(goodsReceiptProblem({ ...ok, receivedOn: "2026-12-31" })).toBe("date");
  });
  it("matches PO, receipt and bill (three-way; client decision: block when linked)", () => {
    const ok = { po: { state: "approved" as const, partnerId: "M1", entity: "ESTRADA" }, bill: { partnerId: "M1", entity: "ESTRADA", gross: money("40") }, received: money("100"), billed: money("60") };
    expect(matchProblem(ok)).toBeNull();
    expect(matchProblem({ ...ok, billed: money("61") })).toBe("over");
    expect(matchProblem({ ...ok, bill: { ...ok.bill, partnerId: "M2" } })).toBe("partner");
    expect(matchProblem({ ...ok, bill: { ...ok.bill, entity: "MATRIK" } })).toBe("entity");
    expect(matchProblem({ ...ok, po: { ...ok.po, state: "head" } })).toBe("state");
  });
  it("holds what is ordered and not yet billed as commitment", () => {
    expect([openCommitment(money("100"), money("30")).toString(), openCommitment(money("100"), money("130")).toString()]).toEqual(["70", "0"]);
  });
});
