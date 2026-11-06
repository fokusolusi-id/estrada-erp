import { describe, expect, it } from "vitest";
import {
  allocateShared,
  allocationShares,
  entityAllocation,
  fixedProblem,
  revenueByEntity,
  splitAmount,
  type AllocationContext,
} from "../src/allocation";
import { money, sum, ZERO } from "../src/money";
import { contribution, pnl, type SummaryLine } from "../src/summary";

const ENTITIES = ["ESTRADA", "MATRIK", "DJALU", "PAS"];
const flat = (v: number | string) => Array.from({ length: 12 }, () => money(v));
const line = (id: string, category: SummaryLine["category"], entity: string, monthly: number | string) => ({
  id,
  category,
  entity,
  ownerUnit: "FRM",
  months: flat(monthly),
});
const pct = (shares: Map<string, unknown>) => Object.fromEntries([...shares].map(([k, v]) => [k, (v as { times(n: number): { toFixed(d: number): string } }).times(100).toFixed(2)]));

// Revenue per year: ESTRADA 600, MATRIK 300, DJALU 60, PAS 240 (client decision: all three bases, four-way split).
const revenue = [line("r1", "Revenue", "ESTRADA", 50), line("r2", "Revenue", "MATRIK", 25), line("r3", "Revenue", "DJALU", 5), line("r4", "Revenue", "PAS", 20)];
const ctx: AllocationContext = {
  entities: ENTITIES,
  revenue: revenueByEntity(revenue),
  headcount: new Map([["ESTRADA", 60], ["MATRIK", 30], ["DJALU", 5], ["PAS", 5]]),
};

describe("allocationShares: how a shared cost splits across ESTRADA, MATRIK, DJALU and PAS", () => {
  it("by revenue share, from the version's revenue lines", () => {
    const r = allocationShares({ basis: "revenue" }, ctx);
    expect("shares" in r && pct(r.shares)).toEqual({ ESTRADA: "50.00", MATRIK: "25.00", DJALU: "5.00", PAS: "20.00" });
  });

  it("by headcount, from the head count Finance types per entity", () => {
    const r = allocationShares({ basis: "headcount" }, ctx);
    expect("shares" in r && pct(r.shares)).toEqual({ ESTRADA: "60.00", MATRIK: "30.00", DJALU: "5.00", PAS: "5.00" });
  });

  it("by fixed percentages set on the line", () => {
    const r = allocationShares({ basis: "fixed", fixed: { ESTRADA: "40", MATRIK: "40", DJALU: "10", PAS: "10" } }, ctx);
    expect("shares" in r && pct(r.shares)).toEqual({ ESTRADA: "40.00", MATRIK: "40.00", DJALU: "10.00", PAS: "10.00" });
  });

  it("refuses a basis it cannot compute, so the line stays where it is", () => {
    expect(allocationShares({ basis: "revenue" }, { ...ctx, revenue: new Map() })).toEqual({ problem: "no_revenue" });
    expect(allocationShares({ basis: "headcount" }, { ...ctx, headcount: new Map([["ESTRADA", 0]]) })).toEqual({ problem: "no_headcount" });
    expect(allocationShares({ basis: "fixed", fixed: { ESTRADA: "50", MATRIK: "40" } }, ctx)).toEqual({ problem: "fixed_not_100" });
  });
});

describe("fixedProblem: percentages Finance types", () => {
  it("must be zero or more and add up to 100", () => {
    expect(fixedProblem({ ESTRADA: "70", MATRIK: "30" }, ENTITIES)).toBeNull();
    expect(fixedProblem({ ESTRADA: "33,33", MATRIK: "33,33", DJALU: "33,34" }, ENTITIES)).toBeNull();
    expect(fixedProblem({ ESTRADA: "70", MATRIK: "20" }, ENTITIES)).toBe("fixed_not_100");
    expect(fixedProblem({ ESTRADA: "110", MATRIK: "-10" }, ENTITIES)).toBe("fixed_negative");
    expect(fixedProblem({ ESTRADA: "abc", MATRIK: "100" }, ENTITIES)).toBe("fixed_invalid");
    expect(fixedProblem({ LAIN: "100" }, ENTITIES)).toBe("fixed_unknown_entity");
  });
});

describe("splitAmount: to the sen, and nothing lost", () => {
  it("gives the leftover sen to the largest share", () => {
    const thirds = new Map([["ESTRADA", money(1).div(3)], ["MATRIK", money(1).div(3)], ["DJALU", money(1).div(3)]]);
    const out = splitAmount(money("100"), thirds);
    expect([...out.values()].map((m) => m.toFixed(2))).toEqual(["33.34", "33.33", "33.33"]);
    expect(sum([...out.values()]).toFixed(2)).toBe("100.00");
  });
});

describe("allocateShared: shared lines spread over the entities, in reports only", () => {
  const shared = line("s1", "OPEX", "ESTRADA", 10);
  const own = line("o1", "OPEX", "MATRIK", 1);
  const lines = [...revenue, shared, own];

  it("replaces each shared line with one share per entity and keeps every company total", () => {
    const { lines: out, problems } = allocateShared(lines, new Map([["s1", { basis: "revenue" as const }]]), ctx);
    expect(problems).toEqual([]);
    const parts = out.filter((l) => l.allocatedFrom === "s1");
    expect(parts.map((l) => [l.entity, sum(l.months).toFixed(2)])).toEqual([
      ["ESTRADA", "60.00"],
      ["MATRIK", "30.00"],
      ["DJALU", "6.00"],
      ["PAS", "24.00"],
    ]);
    expect(pnl(out).map((r) => r.total.toFixed(2))).toEqual(pnl(lines).map((r) => r.total.toFixed(2)));
    expect(out.find((l) => l.id === "o1")).toBe(own);
  });

  it("leaves a line it cannot allocate where it is and reports why", () => {
    const { lines: out, problems } = allocateShared(lines, new Map([["s1", { basis: "headcount" as const }]]), { ...ctx, headcount: new Map() });
    expect(problems).toEqual([{ id: "s1", problem: "no_headcount" }]);
    expect(out).toEqual(lines);
  });

  it("never allocates revenue lines", () => {
    const { lines: out } = allocateShared(lines, new Map([["r1", { basis: "fixed" as const, fixed: { MATRIK: "100" } }]]), ctx);
    expect(out).toEqual(lines);
  });
});

describe("entityAllocation: the Per entitas table before and after", () => {
  it("shows each entity's own cost, its share of shared cost and the net after allocation", () => {
    const shared = line("s1", "OPEX", "ESTRADA", 10);
    const before = [...revenue, shared];
    const after = allocateShared(before, new Map([["s1", { basis: "revenue" as const }]]), ctx).lines;
    const rows = entityAllocation(contribution(before, (l) => l.entity), contribution(after, (l) => l.entity), ENTITIES);
    expect(rows.map((r) => [r.key, r.revenue.toFixed(0), r.costBefore.toFixed(0), r.allocated.toFixed(0), r.costAfter.toFixed(0), r.netAfter.toFixed(0)])).toEqual([
      ["ESTRADA", "600", "120", "-60", "60", "540"],
      ["MATRIK", "300", "0", "30", "30", "270"],
      ["DJALU", "60", "0", "6", "6", "54"],
      ["PAS", "240", "0", "24", "24", "216"],
    ]);
    expect(sum(rows.map((r) => r.allocated)).eq(ZERO)).toBe(true);
  });
});
