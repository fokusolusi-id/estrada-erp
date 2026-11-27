import { describe, expect, it } from "vitest";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import { DEAL_STATUS_LABEL, DEAL_STATUSES, billingPlan, dealProblems, legalDocProblem, pipelineTotals, statusStepProblem, statusBand } from "../src/pipeline";
import type { Actor } from "../src/policy";
import type { Role } from "../src/roles";
import { sphActions, sphMargin, sphNumber, sphProblem, sphStep } from "../src/sph";

describe("pipeline statuses (sheet FC03_Sales_Pipeline, BR-SP-001)", () => {
  it("lists them in order with the client's mapping", () => {
    expect(DEAL_STATUSES.map((s) => DEAL_STATUS_LABEL[s])).toEqual(["Potential Prospect", "Qualified", "POC", "SPH", "Negotiation", "Admin Kontrak", "Won Bidding", "Closed Won", "Drop", "Cancel"]);
    expect(["PC", "NG", "AK", "DR", "CX"].map((s) => statusBand(s as "PC"))).toEqual([[30, 60], [60, 70], [70, 80], [0, 0], [0, 0]]);
  });
  it("moves one step at a time, POC optional", () => {
    expect(statusStepProblem("PP", "PT", false)).toBeNull();
    expect(statusStepProblem("PP", "QO", false)).toBe("skip");
    expect(statusStepProblem("PT", "QO", false)).toBeNull();
    expect(statusStepProblem("PT", "PC", false)).toBeNull();
    expect(statusStepProblem("QO", "AK", true)).toBe("skip");
    expect(statusStepProblem("WB", "CW", false)).toBeNull();
    expect(statusStepProblem("AK", "QO", false)).toBeNull();
    expect(statusStepProblem("WB", "WB", false)).toBeNull();
  });
  it("starts a new deal no later than SPH", () => {
    expect(["PP", "PT", "PC", "QO"].map((s) => statusStepProblem(null, s as "PP", false))).toEqual([null, null, null, null]);
    expect(statusStepProblem(null, "NG", true)).toBe("skip");
  });
  it("drops or cancels anything not signed, and reopens only to the start", () => {
    expect(statusStepProblem("AK", "DR", false)).toBeNull();
    expect(statusStepProblem("CW", "CX", false)).toBe("closed");
    expect(statusStepProblem("DR", "PP", false)).toBeNull();
    expect(statusStepProblem("CX", "WB", true)).toBe("skip");
  });
  it("needs an approved SPH to pass beyond SPH (client decision, BR-SP-003)", () => {
    expect(statusStepProblem("QO", "NG", false)).toBe("sph");
    expect(statusStepProblem("QO", "NG", true)).toBeNull();
    expect(statusStepProblem("NG", "AK", false)).toBeNull();
  });
  it("leaves dropped and cancelled deals out of the totals and the invoice plan", () => {
    const d = (status: "PP" | "DR", value: string) => ({ status, value, probability: status === "DR" ? "0" : "20", termins: [{ amount: value, plannedDate: "2027-01-01" }] });
    expect(pipelineTotals([d("PP", "100"), d("DR", "900")]).value.toString()).toBe("100");
    expect(billingPlan([d("PP", "100"), d("DR", "900")], 2027).total.toString()).toBe("100");
  });
});

describe("legal documents (BR-SP-007: P6, P8, contract in sequence)", () => {
  it("needs the earlier one done", () => {
    expect(legalDocProblem({ p6Status: "done", p8Status: "circulating", contractStatus: null })).toBeNull();
    expect(legalDocProblem({ p6Status: "circulating", p8Status: "draft", contractStatus: null })).toBe("order");
    expect(legalDocProblem({ p6Status: "done", p8Status: null, contractStatus: "draft" })).toBe("order");
    expect(legalDocProblem({})).toBeNull();
    const deal = { entity: "ESTRADA", customer: "T", segment: "Telco Business", project: "x", coaCode: "4100", value: "1", status: "PP" as const, probability: "10", type: "new" as const, startMonth: 1, endMonth: 12 };
    expect(dealProblems({ ...deal, p8Status: "done" }).map((p) => p.field)).toContain("legal");
  });
});

describe("SPH (BR-SP-003; sheet FC03_Sales_Pipeline)", () => {
  const org = new OrgTree([{ code: "DIR", parent: null }, { code: "BCD", parent: "DIR" }, { code: "FRM", parent: "DIR" }]);
  const who = (userId: string, role: Role, orgUnit: string): Actor => ({ userId, role, orgUnit, entities: ["*"] });
  const sales = who("sales", "requestor", "BCD");
  const bfp = who("bfp", "bfp", "FRM");
  const head = who("head", "division_owner", "BCD");
  const director = who("dir", "director", "DIR");
  const sph = { state: "pricing" as const, entity: "ESTRADA", createdBy: "sales", createdRole: "requestor" as Role, createdUnit: "BCD", reviewedBy: null };

  it("numbers per company and year", () => expect(sphNumber("ESTRADA", "2027-03-04", 7)).toBe("SPH/ESTRADA/27/0007"));
  it("checks the figures and shows the margin", () => {
    expect(sphProblem({ price: money("100"), cogs: money("70"), issuedOn: "2027-01-01", today: "2027-01-01" })).toBeNull();
    expect(sphProblem({ price: money("0"), cogs: money("0"), issuedOn: "2027-01-01", today: "2027-01-01" })).toBe("amount");
    expect(sphProblem({ price: money("1"), cogs: money("1"), issuedOn: "2027-01-02", today: "2027-01-01" })).toBe("date");
    expect(sphMargin(money("100"), money("70")).toString()).toBe("30");
  });
  it("goes Pricing by BFP, then the Head BusDev", () => {
    expect(sphStep(sph, "review", bfp, org, "")).toEqual({ to: "approval" });
    expect(sphActions(sph, head, org)).toEqual([]);
    const reviewed = { ...sph, state: "approval" as const, reviewedBy: "bfp" };
    expect(sphStep(reviewed, "approve", head, org, "")).toEqual({ to: "approved" });
    expect(sphActions(reviewed, director, org)).toEqual([]);
  });
  it("goes to the Direktur when the Head BusDev wrote it", () => {
    const own = { ...sph, state: "approval" as const, createdBy: "head", createdRole: "division_owner" as Role, reviewedBy: "bfp" };
    expect(sphActions(own, head, org)).toEqual([]);
    expect(sphStep(own, "approve", director, org, "")).toEqual({ to: "approved" });
  });
  it("returns with a note, and the writer sends it again", () => {
    expect(sphStep(sph, "return", bfp, org, " ")).toEqual({ problem: "note_required" });
    expect(sphStep(sph, "return", bfp, org, "margin tipis")).toEqual({ to: "returned" });
    expect(sphActions({ ...sph, state: "returned" }, sales, org)).toEqual(["resubmit"]);
    expect(sphActions({ ...sph, state: "approved" }, head, org)).toEqual([]);
  });
});
