import { describe, expect, it } from "vitest";
import { cashSummary, headcountByUnit, homeWidgets, monthsElapsed, obligoSummary, pipelineFunnel, spendingByUnit } from "../src/home";
import { money, ZERO } from "../src/money";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import type { Role } from "../src/roles";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "FRM", parent: "DIR" },
  { code: "BCD", parent: "DIR" },
  { code: "PDMS", parent: "DIR" },
  { code: "SCM", parent: "PDMS" },
  { code: "HCM", parent: "DIR" },
]);
const actor = (role: Role, orgUnit: string): Actor => ({ userId: "u", role, orgUnit, entities: ["*"] });
const widgets = (role: Role, unit: string) => homeWidgets(actor(role, unit), org);
const year = (amount: string) => Array.from({ length: 12 }, () => money(amount));
const paid = (jan: string, feb = "0") => [money(jan), money(feb), ...Array.from({ length: 10 }, () => ZERO)];

describe("homeWidgets (plan: Beranda per role)", () => {
  it("gives each role the cards the plan lists", () => {
    expect(widgets("director", "DIR")).toEqual(["rka", "cashflow", "obligo", "pipeline", "headcount", "projects"]);
    expect(widgets("auditor", "DIR")).toEqual(["rka", "cashflow", "obligo", "pipeline", "headcount", "projects"]);
    expect(widgets("finance", "FRM")).toEqual(["rka", "costCenter", "cashflow", "obligo"]);
    expect(widgets("cash_manager", "FRM")).toEqual(["cashflow", "obligo"]);
    expect(widgets("default_owner", "SCM")).toEqual(["costCenter", "projects"]);
    expect(widgets("requestor", "SCM")).toEqual(["projects"]);
    expect(widgets("admin", "DIR")).toEqual([]);
    expect(widgets("bfp", "FRM")).toEqual([]);
  });
  it("adds the pipeline for BCD, projects for PDMS and BCD, headcount for HCM", () => {
    expect(widgets("requestor", "BCD")).toEqual(["pipeline", "projects"]);
    expect(widgets("division_owner", "PDMS")).toEqual(["rka", "costCenter", "headcount", "projects"]);
    expect(widgets("requestor", "HCM")).toEqual(["headcount"]);
  });
  it("treats the FRM Division Owner as CFO (client decision)", () => {
    expect(widgets("division_owner", "FRM")).toEqual(["rka", "costCenter", "cashflow", "obligo", "headcount"]);
  });
});

describe("spendingByUnit (EXEC_13_RKA, EXEC_14_Cost_Center)", () => {
  const lines = [
    { id: "a", unit: "SCM", category: "OPEX" as const, months: year("100") },
    { id: "b", unit: "SCM", category: "COGS" as const, months: year("100") },
    { id: "c", unit: "BCD", category: "OPEX" as const, months: year("100") },
    { id: "d", unit: "BCD", category: "Revenue" as const, months: year("999") },
  ];
  const realisasi = new Map([["a", { months: paid("300", "200"), committed: money("50") }]]);
  const rows = spendingByUnit(lines, realisasi, 2);
  const scm = rows.find((r) => r.unit === "SCM")!;

  it("adds up cost lines only: budget, actual, commitment, remaining and utilisation", () => {
    expect([scm.budget, scm.actual, scm.committed, scm.remaining].map(String)).toEqual(["2400", "500", "50", "1850"]);
    expect(scm.utilisation!.toFixed(1)).toBe("22.9");
    expect(rows.find((r) => r.unit === "BCD")!.budget.toString()).toBe("1200");
  });
  it("projects the run rate and flags a variance above 10% where there is spending", () => {
    expect(scm.runRate!.toString()).toBe("3000");
    expect(scm.flagged).toBe(true);
    expect(rows.find((r) => r.unit === "BCD")!.flagged).toBe(false);
  });
  it("has no run rate before the budget year starts", () => {
    expect(spendingByUnit(lines, realisasi, 0)[0]!.runRate).toBeNull();
  });
});

describe("monthsElapsed", () => {
  it("counts the budget year's months up to today", () => {
    expect([monthsElapsed(2027, "2026-11-27"), monthsElapsed(2026, "2026-11-27"), monthsElapsed(2025, "2026-11-27")]).toEqual([0, 11, 12]);
  });
});

describe("pipelineFunnel (EXEC_04)", () => {
  it("counts, weighs and ages deals per status, in funnel order", () => {
    const rows = pipelineFunnel(
      [
        { status: "WB", value: "1000", probability: "80", createdOn: "2026-11-17" },
        { status: "PP", value: "500", probability: "20", createdOn: "2026-11-27" },
        { status: "WB", value: "1000", probability: "70", createdOn: "2026-11-27" },
      ],
      "2026-11-27",
    );
    expect(rows.map((r) => [r.status, r.deals, r.value.toString(), r.weighted.toString(), r.ageDays])).toEqual([
      ["PP", 1, "500", "100", 0],
      ["WB", 2, "2000", "1500", 5],
    ]);
  });
});

describe("cashSummary (EXEC_10_Cashflow)", () => {
  const rows = { receipts: year("100"), cogsPaid: year("-30"), opexPaid: year("-20"), interestPaid: year("0"), taxPaid: year("0"), capexPaid: year("0"), closing: year("500") };
  it("shows money in and out by month, the ending balance and the runway", () => {
    const s = cashSummary(rows);
    expect([s.in[0]!.toString(), s.out[0]!.toString(), s.ending.toString(), s.runwayMonths!.toString()]).toEqual(["100", "50", "500", "10"]);
  });
  it("has no runway left when the year ends without cash", () => {
    expect(cashSummary({ ...rows, closing: year("-500") }).runwayMonths!.toString()).toBe("0");
  });
  it("has no runway when nothing is paid out", () => {
    expect(cashSummary({ ...rows, cogsPaid: year("0"), opexPaid: year("0") }).runwayMonths).toBeNull();
  });
});

describe("obligoSummary (EXEC_11_Bank_Obligo)", () => {
  const facility = (name: string, limit: string | null, outstanding: string) => ({ name, creditLimit: limit ? money(limit) : null, openingBalance: money(outstanding), outstanding: year(outstanding) });
  it("gives available and utilisation per facility and flags one holding over half the plafon", () => {
    const s = obligoSummary([facility("KMK A", "600", "300"), facility("KMK B", "400", "100"), facility("Lama", null, "50")], 0);
    expect(s.rows.map((r) => [r.name, r.available?.toString() ?? null, r.utilisation?.toFixed(0) ?? null])).toEqual([["KMK A", "300", "50"], ["KMK B", "300", "25"], ["Lama", null, null]]);
    expect([s.limit.toString(), s.outstanding.toString(), s.concentrated]).toEqual(["1000", "450", "KMK A"]);
  });
});

describe("headcountByUnit (EXEC_15_Headcount, counts only)", () => {
  it("compares people with the RKA headcount plan", () => {
    expect(headcountByUnit(["SCM", "SCM", "BCD"], [{ unit: "SCM", count: 3 }, { unit: "HCM", count: 1 }])).toEqual([
      { unit: "BCD", actual: 1, planned: 0 },
      { unit: "HCM", actual: 0, planned: 1 },
      { unit: "SCM", actual: 2, planned: 3 },
    ]);
  });
});
