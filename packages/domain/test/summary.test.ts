import { describe, expect, it } from "vitest";
import { money, sum } from "../src/money";
import { OrgTree } from "../src/org";
import { contribution, pnl, type SummaryLine } from "../src/summary";

const flat = (a: string) => Array.from({ length: 12 }, () => money(a));
const line = (category: SummaryLine["category"], ownerUnit: string, entity: string, monthly: string): SummaryLine => ({
  category,
  ownerUnit,
  entity,
  months: flat(monthly),
});

const org = new OrgTree([
  { code: "DIR", parent: null, type: "company" },
  { code: "PDMS", parent: "DIR", type: "division" },
  { code: "PMO", parent: "PDMS", type: "department" },
  { code: "SCM", parent: "PDMS", type: "department" },
  { code: "BCD", parent: "DIR", type: "division" },
  { code: "FRM", parent: "DIR", type: "division" },
  { code: "PST", parent: "DIR", type: "division" },
]);

const lines = [
  line("Revenue", "BCD", "ESTRADA", "100"),
  line("Revenue", "BCD", "MATRIK", "50"),
  line("COGS", "PMO", "ESTRADA", "40"),
  line("OPEX", "SCM", "ESTRADA", "10"),
  line("OTHERS", "FRM", "ESTRADA", "2"),
  line("CAPEX", "PST", "ESTRADA", "5"),
];

const row = (key: string) => pnl(lines).find((r) => r.key === key)!;

describe("pnl: the Management Summary from one ledger of lines", () => {
  it("totals each category across the year", () => {
    expect(row("Revenue").total.toString()).toBe("1800");
    expect(row("COGS").total.toString()).toBe("480");
    expect(row("OPEX").total.toString()).toBe("120");
    expect(row("OTHERS").total.toString()).toBe("24");
    expect(row("CAPEX").total.toString()).toBe("60");
  });

  it("derives gross profit, operating profit and profit before tax per month", () => {
    expect(row("GrossProfit").months[0]!.toString()).toBe("110");
    expect(row("OperatingProfit").total.toString()).toBe("1200");
    expect(row("ProfitBeforeTax").total.toString()).toBe("1176");
  });

  it("counts total cost as the workbook's Rekap does: COGS + OPEX + OTHERS + CAPEX", () => {
    // RKA 2027: 242.0 + 32.0 + 8.2 + 12.2 = Rp 294.4 bn
    expect(row("TotalCost").total.toString()).toBe("684");
  });

  it("marks computed rows so they are never typed", () => {
    expect(pnl(lines).filter((r) => r.derived).map((r) => r.key)).toEqual([
      "GrossProfit",
      "OperatingProfit",
      "ProfitBeforeTax",
      "TotalCost",
    ]);
  });
});

describe("contribution: Kontribusi Divisi and per entity", () => {
  it("rolls departments up to their division", () => {
    const byDivision = contribution(lines, (l) => org.divisionOf(l.ownerUnit));
    expect(byDivision.map((d) => [d.key, d.revenue.toString(), d.cost.toString()])).toEqual([
      ["BCD", "1800", "0"],
      ["PDMS", "0", "600"],
      ["FRM", "0", "24"],
      ["PST", "0", "60"],
    ]);
  });

  it("reconciles to the summary: no gap between Rekap and Kontribusi Divisi", () => {
    const byDivision = contribution(lines, (l) => org.divisionOf(l.ownerUnit));
    expect(sum(byDivision.map((d) => d.cost)).eq(row("TotalCost").total)).toBe(true);
    expect(sum(byDivision.map((d) => d.revenue)).eq(row("Revenue").total)).toBe(true);
  });

  it("shows entities with revenue and no cost, the gap the plan flags for MATRIK", () => {
    const byEntity = contribution(lines, (l) => l.entity);
    expect(byEntity.find((e) => e.key === "MATRIK")).toMatchObject({ lines: 1 });
    expect(byEntity.find((e) => e.key === "MATRIK")!.cost.isZero()).toBe(true);
    expect(byEntity.find((e) => e.key === "MATRIK")!.net.toString()).toBe("600");
  });
});

describe("OrgTree.divisionOf", () => {
  it("returns the unit itself for a division and the unit when no division is above it", () => {
    expect(org.divisionOf("SCM")).toBe("PDMS");
    expect(org.divisionOf("FRM")).toBe("FRM");
    expect(org.divisionOf("DIR")).toBe("DIR");
  });
});
