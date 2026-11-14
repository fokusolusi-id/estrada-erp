import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import { PLANNING_ITEMS, baselineProblems, canPlanning, executionProblems, kickoffGateProblems, kurvaS } from "../src/planning";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "BCD", parent: "DIR" },
  { code: "PDMS", parent: "DIR" },
  { code: "PMO", parent: "PDMS" },
  { code: "ISO", parent: "PDMS" },
]);
const actor = (over: Partial<Actor>): Actor => ({ userId: "u", role: "requestor", orgUnit: "PMO", entities: ["*"], ...over });
const project = { entity: "ESTRADA", team: { pm: "pm", deliveryControl: "dc", projectAdmin: "pa" } };

describe("PLANNING_ITEMS: Tahap Implementasi B rows 1-2, 6-7, 9", () => {
  it("lists the five records of Initiation and Planning with who makes each", () => {
    expect(PLANNING_ITEMS.map((i) => `${i.key}:${i.owner}`)).toEqual(["kickoff:pm", "mom:project_admin", "charter:pm", "risk:pm", "requirements:project_admin"]);
  });
});

describe("kickoffGateProblems: validasi kelayakan project handover masuk (Kick-Off Gate, row 3)", () => {
  it("passes once the kick-off and its MoM are recorded", () => {
    expect(kickoffGateProblems({ filled: ["kickoff", "mom"] })).toEqual([]);
  });

  it("names what is still missing", () => {
    expect(kickoffGateProblems({ filled: ["kickoff"] })).toEqual(["mom"]);
    expect(kickoffGateProblems({ filled: [] })).toEqual(["kickoff", "mom"]);
  });
});

describe("baselineProblems: pengesahan baseline rencana kerja termasuk target RFS (row 8)", () => {
  const ready = { kickoffGateOn: "2026-11-02", filled: ["kickoff", "mom", "charter", "risk"], team: project.team, rfsTargetOn: "2027-06-30" };

  it("passes with the gate approved, charter and risk register recorded, the team set and a target RFS date", () => {
    expect(baselineProblems(ready)).toEqual([]);
  });

  it("requires the kick-off gate first", () => {
    expect(baselineProblems({ ...ready, kickoffGateOn: null })).toEqual(["kickoff_gate"]);
  });

  it("requires the charter and the risk register", () => {
    expect(baselineProblems({ ...ready, filled: ["kickoff", "mom"] })).toEqual(["charter", "risk"]);
  });

  it("requires the whole team to be assigned", () => {
    expect(baselineProblems({ ...ready, team: { ...project.team, deliveryControl: null } })).toEqual(["team"]);
  });

  it("requires a real target RFS date", () => {
    expect(baselineProblems({ ...ready, rfsTargetOn: "2027-06-31" })).toEqual(["rfs_target"]);
    expect(baselineProblems({ ...ready, rfsTargetOn: "" })).toEqual(["rfs_target"]);
  });
});

describe("executionProblems: pekerjaan lapangan dimulai setelah baseline disahkan (Tahap 3)", () => {
  it("lets a site be surveyed before the baseline, but not worked on", () => {
    expect(executionProblems(null, "Belum_Mulai")).toEqual([]);
    expect(executionProblems(null, "Survei")).toEqual([]);
    expect(executionProblems(null, "Terkendala")).toEqual([]);
    for (const status of ["Staging", "Dikirim", "Instalasi", "Uji"] as const) expect(executionProblems(null, status)).toEqual(["baseline"]);
  });

  it("lets everything through once the baseline is approved", () => {
    expect(executionProblems("2026-11-05", "Instalasi")).toEqual([]);
  });
});

describe("canPlanning: matriks peran (Kewenangan A rows 3-6)", () => {
  it("the Project Manager records the kick-off, charter and risk register; the Project Admin the MoM and requirements", () => {
    expect(canPlanning(actor({ userId: "pm" }), "record", "charter", project, org)).toBe(true);
    expect(canPlanning(actor({ userId: "pa" }), "record", "charter", project, org)).toBe(false);
    expect(canPlanning(actor({ userId: "pa" }), "record", "mom", project, org)).toBe(true);
    expect(canPlanning(actor({ userId: "pm" }), "record", "mom", project, org)).toBe(false);
    expect(canPlanning(actor({ userId: "other" }), "record", "kickoff", project, org)).toBe(false);
  });

  it("the Head PMO approves the kick-off gate and the baseline", () => {
    const head = actor({ role: "default_owner", orgUnit: "PMO", userId: "head" });
    expect(canPlanning(head, "approve_gate", null, project, org)).toBe(true);
    expect(canPlanning(head, "approve_baseline", null, project, org)).toBe(true);
    expect(canPlanning(actor({ userId: "pm" }), "approve_gate", null, project, org)).toBe(false);
    expect(canPlanning(actor({ role: "default_owner", orgUnit: "ISO" }), "approve_baseline", null, project, org)).toBe(false);
  });

  it("the people who made the records do not approve them: the Head PMO who is also the Project Manager cannot", () => {
    const both = actor({ role: "default_owner", orgUnit: "PMO", userId: "pm" });
    expect(canPlanning(both, "approve_baseline", null, project, org)).toBe(false);
    expect(canPlanning(both, "approve_gate", null, project, org)).toBe(false);
  });

  it("is read-only on a closed or dropped project", () => {
    expect(canPlanning(actor({ userId: "pm" }), "record", "charter", { ...project, status: "Drop" }, org)).toBe(false);
  });
});

describe("kurvaS: rencana dan aktual kumulatif per bulan", () => {
  const sites = [
    { tglPlanSelesai: "2027-01-20", tglAktualSelesai: "2027-01-25", status: "Selesai" as const },
    { tglPlanSelesai: "2027-02-10", tglAktualSelesai: "2027-03-02", status: "Selesai" as const },
    { tglPlanSelesai: "2027-02-28", tglAktualSelesai: null, status: "Instalasi" as const },
    { tglPlanSelesai: "2027-04-15", tglAktualSelesai: null, status: "Belum_Mulai" as const },
  ];

  it("accumulates the planned and the actual finishes month by month, over the contract's sites", () => {
    expect(kurvaS(sites, 4, "2027-03-15")).toEqual([
      { month: "2027-01", planned: 25, actual: 25 },
      { month: "2027-02", planned: 75, actual: 25 },
      { month: "2027-03", planned: 75, actual: 50 },
      { month: "2027-04", planned: 100, actual: null },
    ]);
  });

  it("divides by the contract's sites, not by the sites registered", () => {
    expect(kurvaS([sites[0]!], 4, "2027-01-31")).toEqual([{ month: "2027-01", planned: 25, actual: 25 }]);
  });

  it("stops the actual line at the current month", () => {
    const k = kurvaS(sites, 4, "2027-02-15");
    expect(k.map((p) => p.actual)).toEqual([25, 25, null, null]);
  });

  it("is empty without sites", () => {
    expect(kurvaS([], 4, "2027-03-15")).toEqual([]);
  });
});
