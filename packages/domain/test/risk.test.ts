import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import { canDecideRisk, canEditRisk, canViewRisk, canWorkRisk, heatmap, nextReview, riskFromWarning, riskProblem, riskScore, severityOf, statusProblem } from "../src/risk";

const org = new OrgTree([{ code: "FRM", parent: null }]);
const actor = (userId: string, role: Actor["role"], orgUnit = "BCD", entities = ["*"]): Actor => ({ userId, role, orgUnit, entities });
const finance = actor("f", "finance");
const cfo = actor("c", "division_owner", "FRM");
const bod = actor("d", "director");
const pt = actor("p", "director", "DIR", ["PAS"]);
const auditor = actor("a", "auditor");
const owner = actor("o", "default_owner");
const risk = { entity: null as string | null, ownerUserId: "o", likelihood: 4, impact: 5 };

describe("score and severity (P3-M3; client chose its bands)", () => {
  it("multiplies likelihood and impact", () => expect(riskScore(4, 5)).toBe(20));
  it("bands the score", () => expect([25, 20, 19, 15, 14, 8, 7, 1].map(severityOf)).toEqual(["critical", "critical", "high", "high", "medium", "medium", "low", "low"]));
});

describe("riskProblem", () => {
  const v = { title: "Konsentrasi customer", likelihood: 3, impact: 3, ownerUserId: "o", actionPlan: "", dueOn: null as string | null };
  it("needs a title, an owner and 1 to 5", () => {
    expect([riskProblem(v), riskProblem({ ...v, title: " " }), riskProblem({ ...v, likelihood: 6 }), riskProblem({ ...v, ownerUserId: "" })]).toEqual([null, "title", "scale", "owner"]);
  });
  it("needs a plan and a date when High or Critical", () => {
    expect([riskProblem({ ...v, likelihood: 5 }), riskProblem({ ...v, likelihood: 5, actionPlan: "x" }), riskProblem({ ...v, likelihood: 5, actionPlan: "x", dueOn: "2027-07-01" })]).toEqual(["plan", "plan", null]);
  });
});

describe("access", () => {
  it("is edited by Finance, the Head of FRM and a Direktur covering it", () => {
    expect([finance, cfo, bod, pt, auditor, owner].map((a) => canEditRisk(a, risk, org))).toEqual([true, true, true, false, false, false]);
    expect(canEditRisk(pt, { ...risk, entity: "PAS" }, org)).toBe(true);
  });
  it("is worked on by its owner too", () => expect([owner, auditor].map((a) => canWorkRisk(a, risk, org))).toEqual([true, false]));
  it("is seen by editors, the Auditor and the owner", () => expect([auditor, owner, actor("r", "requestor"), pt].map((a) => canViewRisk(a, risk, org))).toEqual([true, true, false, false]));
  it("is closed or accepted by the Head of FRM or a Direktur, not its owner; a Critical one is accepted by the BOD", () => {
    expect([cfo, bod, finance].map((a) => canDecideRisk(a, risk, "closed", org))).toEqual([true, true, false]);
    expect(canDecideRisk(actor("o", "director"), risk, "closed", org)).toBe(false);
    expect([cfo, bod].map((a) => canDecideRisk(a, risk, "accepted", org))).toEqual([false, true]);
    expect(canDecideRisk(cfo, { ...risk, impact: 4 }, "accepted", org)).toBe(true);
  });
});

describe("status", () => {
  it("closes only with evidence, and decisions need a note", () => {
    expect([statusProblem("in_progress", "closed", { note: "ok", evidence: false }), statusProblem("in_progress", "closed", { note: "ok", evidence: true })]).toEqual(["evidence", null]);
    expect(statusProblem("identified", "accepted", { note: " ", evidence: false })).toBe("note");
    expect(statusProblem("closed", "in_progress", { note: "", evidence: false })).toBe("closed");
    expect(statusProblem("identified", "in_progress", { note: "", evidence: false })).toBeNull();
  });
  it("is reviewed a month on", () => expect([nextReview("2027-06-15"), nextReview("2027-01-31"), nextReview("2027-12-05")]).toEqual(["2027-07-15", "2027-02-28", "2028-01-05"]));
});

describe("heatmap and early warning", () => {
  it("counts live risks per cell", () => {
    const cells = heatmap([{ likelihood: 4, impact: 5, status: "identified" }, { likelihood: 4, impact: 5, status: "in_progress" }, { likelihood: 1, impact: 1, status: "closed" }]);
    expect([cells(4, 5), cells(1, 1)]).toEqual([2, 0]);
  });
  it("turns a critical warning into a Critical risk owned by the first assignee", () => {
    const r = riskFromWarning({ code: "EW-01", subject: "", assignees: ["cfo", "x"], today: "2027-06-01" })!;
    expect([severityOf(riskScore(r.likelihood, r.impact)), r.ownerUserId, r.dueOn, riskProblem(r)]).toEqual(["critical", "cfo", "2027-07-01", null]);
    expect(riskFromWarning({ code: "EW-04", subject: "", assignees: ["cfo"], today: "2027-06-01" })).toBeNull();
    expect(riskFromWarning({ code: "EW-01", subject: "", assignees: [], today: "2027-06-01" })).toBeNull();
  });
});
