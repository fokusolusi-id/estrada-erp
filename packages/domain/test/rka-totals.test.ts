import { describe, expect, it } from "vitest";
import { filterByBoard, money, notFinal, searchLines, totalsByKind } from "../src";

const flat = (a: string) => Array.from({ length: 12 }, () => money(a));

describe("totalsByKind", () => {
  it("never adds revenue to costs: one total per kind, in Pendapatan, Biaya, CAPEX order", () => {
    const totals = totalsByKind([
      { category: "CAPEX", months: flat("3") },
      { category: "OPEX", months: flat("2") },
      { category: "Revenue", months: flat("10") },
      { category: "COGS", months: flat("1") },
      { category: "OTHERS", months: flat("1") },
    ]);
    expect(totals.map((t) => [t.kind, t.total.toFixed(), t.months[0]!.toFixed()])).toEqual([
      ["Revenue", "120", "10"],
      ["Cost", "48", "4"],
      ["CAPEX", "36", "3"],
    ]);
  });

  it("leaves out kinds with no lines", () => {
    expect(totalsByKind([{ category: "OPEX", months: flat("2") }]).map((t) => t.kind)).toEqual(["Cost"]);
    expect(totalsByKind([])).toEqual([]);
  });
});

describe("notFinal", () => {
  it("counts the lines Finance has not finalised or locked", () => {
    const states = ["draft", "consolidation", "division_approval", "finance_review", "awaiting_lock", "locked"] as const;
    expect(notFinal(states.map((state) => ({ state })))).toBe(4);
  });
});

describe("filterByBoard", () => {
  const lines = [
    { id: "a", ownerUnit: "SCM", state: "draft" as const },
    { id: "b", ownerUnit: "SCM", state: "locked" as const },
    { id: "c", ownerUnit: "BCD", state: "draft" as const },
  ];
  const divisionOf = (u: string) => (u === "SCM" ? "PDMS" : u);

  it("keeps the lines a status board cell counts", () => {
    expect(filterByBoard(lines, { division: "PDMS", state: "draft" }, divisionOf).map((l) => l.id)).toEqual(["a"]);
    expect(filterByBoard(lines, { state: "draft" }, divisionOf).map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("ignores a state that does not exist", () => {
    expect(filterByBoard(lines, { state: "bogus" }, divisionOf)).toHaveLength(3);
  });
});

describe("searchLines", () => {
  const lines = [
    { id: "a", coaCode: "4100", coaName: "Pendapatan Sewa CPE", item: "Smart City Termin 1" },
    { id: "b", coaCode: "6241", coaName: "Beban internet", item: null },
  ];
  const ids = (q: string | undefined) => searchLines(lines, q).map((l) => l.id);

  it("finds lines by COA code, COA name or item, ignoring case", () => {
    expect(ids("62")).toEqual(["b"]);
    expect(ids("sewa")).toEqual(["a"]);
    expect(ids("  SMART city ")).toEqual(["a"]);
    expect(ids("tidak ada")).toEqual([]);
  });

  it("keeps everything when the box is empty", () => {
    expect(ids("  ")).toEqual(["a", "b"]);
    expect(ids(undefined)).toEqual(["a", "b"]);
  });
});
