import { describe, expect, it } from "vitest";
import { cashWaterfall, cycleProgress, headlinePrior } from "../src/dashboard";
import { money, ZERO } from "../src/money";

describe("headlinePrior: the change badges compare like for like", () => {
  const twelve = (v: number) => Array.from({ length: 12 }, () => money(v));
  const lines = [
    { category: "Revenue" as const, priorRka: money(1000), months: twelve(100) },
    { category: "COGS" as const, priorRka: money(400), months: twelve(50) },
    { category: "OPEX" as const, priorRka: money(150), months: twelve(10) },
    // No 2026 figure: left out of both sides, so a new line does not show as growth.
    { category: "OPEX" as const, priorRka: null, months: twelve(500) },
    { category: "CAPEX" as const, priorRka: money(50), months: twelve(5) },
  ];

  it("adds RKA 2026 and the 2027 plan over the same lines, with total cost and profit as the workbook computes them", () => {
    const h = headlinePrior(lines);
    expect([h.base.Revenue, h.base.TotalCost, h.base.ProfitBeforeTax, h.base.CAPEX].map((m) => m.toFixed(0))).toEqual(["1000", "600", "450", "50"]);
    expect([h.plan.Revenue, h.plan.TotalCost, h.plan.ProfitBeforeTax, h.plan.CAPEX].map((m) => m.toFixed(0))).toEqual(["1200", "780", "480", "60"]);
    expect([h.covered, h.of]).toEqual([4, 5]);
  });

  it("gives a percent change only when there is a positive base", () => {
    const h = headlinePrior(lines);
    expect(h.change("Revenue")?.toFixed(1)).toBe("20.0");
    expect(headlinePrior([{ category: "Revenue", priorRka: null, months: twelve(1) }]).change("Revenue")).toBeNull();
  });
});

describe("cycleProgress: how far each division's lines have come", () => {
  it("counts lines per division and state, divisions in name order, with the share already final", () => {
    const divisionOf = (u: string) => ({ SCM: "PDMS", PMO: "PDMS", BCD: "BCD" })[u] ?? u;
    const rows = cycleProgress(
      [
        { ownerUnit: "SCM", state: "draft" },
        { ownerUnit: "PMO", state: "consolidation" },
        { ownerUnit: "SCM", state: "locked" },
        { ownerUnit: "BCD", state: "awaiting_lock" },
        { ownerUnit: "BCD", state: "locked" },
      ],
      divisionOf,
    );
    expect(rows.map((r) => [r.division, r.total, r.counts.draft, r.counts.locked, r.finalShare])).toEqual([
      ["BCD", 2, 0, 1, 100],
      ["PDMS", 3, 1, 1, 33],
    ]);
  });
});

describe("cashWaterfall: opening cash to closing cash through each flow of the year", () => {
  it("steps from the opening balance through every flow, each bar starting where the last ended", () => {
    const m = (v: number) => Array.from({ length: 12 }, (_, i) => (i === 0 ? money(v) : ZERO));
    const steps = cashWaterfall({
      opening: [money(100), ...Array.from({ length: 11 }, () => ZERO)],
      receipts: m(300),
      cogsPaid: m(-120),
      opexPaid: m(-80),
      interestPaid: m(-10),
      taxPaid: m(-20),
      capexPaid: m(-40),
      financing: m(50),
      closing: [...Array.from({ length: 11 }, () => ZERO), money(180)],
    });
    expect(steps.map((s) => [s.key, s.start.toFixed(0), s.end.toFixed(0)])).toEqual([
      ["opening", "0", "100"],
      ["receipts", "100", "400"],
      ["cogs", "400", "280"],
      ["opex", "280", "200"],
      ["interest", "200", "190"],
      ["tax", "190", "170"],
      ["capex", "170", "130"],
      ["financing", "130", "180"],
      ["closing", "0", "180"],
    ]);
  });
});
