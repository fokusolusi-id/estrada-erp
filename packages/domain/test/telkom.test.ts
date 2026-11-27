import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import type { Role } from "../src/roles";
import {
  ASSURANCE_AREAS, TELKOM_STAGES, assuranceSummary, canCompleteStage, canViewTracker, dueTier, escalationRecipients, stagePosition, stageProblem,
} from "../src/telkom";

const org = new OrgTree([
  { code: "DIR", parent: null }, { code: "BCD", parent: "DIR" }, { code: "PDMS", parent: "DIR" }, { code: "PMO", parent: "PDMS" }, { code: "MSO", parent: "PDMS" },
  { code: "SCM", parent: "PDMS" }, { code: "FRM", parent: "DIR" }, { code: "FRM-LCM", parent: "FRM" }, { code: "FRM-FIN-ATM", parent: "FRM" },
]);
const who = (role: Role, orgUnit: string): Actor => ({ userId: "u", role, orgUnit, entities: ["*"] });

describe("the stages (sheet 12_Stages_Penagihan; BR-PNG-001)", () => {
  it("are twelve with their SLA days and escalation level", () => {
    expect(TELKOM_STAGES.map((s) => s.slaDays)).toEqual([5, 5, 10, null, 7, 3, 2, 7, 2, null, null, null]);
    expect(TELKOM_STAGES.map((s) => s.level)).toEqual([0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 4]);
    expect(TELKOM_STAGES.filter((s) => s.optional).map((s) => s.no)).toEqual([7, 8, 10]);
  });
  it("finds the stage in hand, started when the one before was done, and its deadline", () => {
    expect(stagePosition("2027-01-01", [])).toEqual({ current: 1, since: "2027-01-01", deadline: "2027-01-06" });
    expect(stagePosition("2027-01-01", [{ stage: 1, doneOn: "2027-01-04" }, { stage: 2, doneOn: "2027-01-05" }, { stage: 3, doneOn: "2027-01-09" }])).toEqual({ current: 4, since: "2027-01-09", deadline: null });
    expect(stagePosition("2027-01-01", TELKOM_STAGES.map((s) => ({ stage: s.no, doneOn: "2027-02-01" }))).current).toBeNull();
  });
});

describe("stageProblem", () => {
  const ok = { stage: 2, current: 2, since: "2027-01-04", doneOn: "2027-01-05", today: "2027-01-05", notApplicable: false, reason: "", hasDocument: true };
  it("goes in order, with a date and the evidence (BR-PNG-001, BR-PNG-003)", () => {
    expect(stageProblem(ok)).toBeNull();
    expect(stageProblem({ ...ok, stage: 3 })).toBe("order");
    expect(stageProblem({ ...ok, doneOn: "2027-01-03" })).toBe("date");
    expect(stageProblem({ ...ok, doneOn: "2027-01-06" })).toBe("date");
    expect(stageProblem({ ...ok, hasDocument: false })).toBe("document");
  });
  it("lets only WFM and BA Kesepakatan be not applicable, with a reason (client decision)", () => {
    const na = { ...ok, stage: 8, current: 8, notApplicable: true, hasDocument: false, reason: "layanan baru" };
    expect(stageProblem(na)).toBeNull();
    expect(stageProblem({ ...na, reason: " " })).toBe("reason");
    expect(stageProblem({ ...na, stage: 9, current: 9 })).toBe("required");
  });
});

describe("dueTier (client decision: one tier per SLA period, up to 5)", () => {
  it("starts the day after the deadline", () => {
    expect(["2027-01-06", "2027-01-07", "2027-01-11", "2027-01-12", "2027-03-01"].map((d) => dueTier("2027-01-06", 5, d))).toEqual([0, 1, 1, 2, 5]);
    expect(dueTier(null, null, "2027-03-01")).toBe(0);
  });
});

describe("who (sheet 12: the Estrada actor of each stage; client decision on recipients)", () => {
  it("lets each stage's own unit complete it", () => {
    expect(canCompleteStage(who("requestor", "BCD"), 1, "ESTRADA", org)).toBe(true);
    expect(canCompleteStage(who("requestor", "BCD"), 3, "ESTRADA", org)).toBe(false);
    expect(canCompleteStage(who("requestor", "FRM-LCM"), 3, "ESTRADA", org)).toBe(true);
    expect(canCompleteStage(who("requestor", "PMO"), 6, "ESTRADA", org)).toBe(true);
    expect(canCompleteStage(who("requestor", "MSO"), 8, "ESTRADA", org)).toBe(true);
    expect(canCompleteStage(who("requestor", "FRM-FIN-ATM"), 11, "ESTRADA", org)).toBe(true);
    expect(canCompleteStage(who("cash_manager", "FRM"), 12, "ESTRADA", org)).toBe(true);
    expect(canCompleteStage(who("finance", "FRM"), 12, "ESTRADA", org)).toBe(false);
  });
  it("is read by the units that work it and the overseers", () => {
    expect(canViewTracker(who("requestor", "SCM"), org)).toBe(true);
    expect(canViewTracker(who("auditor", "DIR"), org)).toBe(true);
    expect(canViewTracker(who("admin", "DIR"), org)).toBe(false);
  });
  it("escalates to the unit, then its head, then the Direktur", () => {
    const seats = [
      { orgUnit: "BCD", role: "requestor" as Role, occupant: "sales", entities: ["*"] },
      { orgUnit: "BCD", role: "division_owner" as Role, occupant: "head", entities: ["*"] },
      { orgUnit: "DIR", role: "director" as Role, occupant: "dir", entities: ["*"] },
    ];
    expect(escalationRecipients(1, 1, "ESTRADA", seats, org)).toEqual(["head", "sales"]);
    expect(escalationRecipients(1, 4, "ESTRADA", seats, org)).toEqual(["head"]);
    expect(escalationRecipients(1, 5, "ESTRADA", seats, org)).toEqual(["dir"]);
  });
});

describe("JPMB assurance (BR-PNG-002)", () => {
  it("counts done and in progress for each of the seven areas", () => {
    expect(ASSURANCE_AREAS).toHaveLength(7);
    const s = assuranceSummary([{ area: "legal", done: true }, { area: "legal", done: false }, { area: "finance", done: false }]);
    expect(s.find((a) => a.area === "legal")).toMatchObject({ total: 2, done: 1, inProgress: 1, percent: 50 });
    expect(s.find((a) => a.area === "asc")).toMatchObject({ total: 0, percent: null });
  });
});
