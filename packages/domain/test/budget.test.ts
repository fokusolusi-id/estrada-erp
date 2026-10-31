import { describe, expect, it } from "vitest";
import { lineTotal, summarize, validateLine, type BudgetLine } from "../src/budget";
import { money } from "../src/money";

const flat = (amount: string) => Array.from({ length: 12 }, () => money(amount));

const coa = new Map([
  ["6241", { code: "6241", category: "OPEX" as const, status: "active" as const }],
  ["5100", { code: "5100", category: "COGS" as const, status: "active" as const }],
  ["4100", { code: "4100", category: "Revenue" as const, status: "active" as const }],
]);
const entities = new Set(["ESTRADA", "MATRIK", "DJALU", "PAS"]);

const line = (over: Partial<BudgetLine> = {}): BudgetLine => ({
  id: "l1",
  coaCode: "6241",
  entity: "ESTRADA",
  requestorUnit: "SCM",
  ownerUnit: "SCM",
  months: flat("19821320"),
  basis: "Kontrak 2027",
  ...over,
});

describe("budget line", () => {
  it("totals Jan to Dec (CARA PENGISIAN point 7: never typed by hand)", () => {
    expect(lineTotal(line()).toFixed(0)).toBe("237855840");
  });

  it("requires exactly 12 months", () => {
    const errors = validateLine(line({ months: flat("1").slice(0, 11) }), { coa, entities });
    expect(errors).toContainEqual({ field: "months", code: "months_length" });
  });

  it("rejects a COA code missing from the master (e.g. 4300, 5100-1)", () => {
    const errors = validateLine(line({ coaCode: "5100-1" }), { coa, entities });
    expect(errors).toContainEqual({ field: "coaCode", code: "coa_unknown" });
  });

  it("rejects an unknown entity", () => {
    const errors = validateLine(line({ entity: "XYZ" }), { coa, entities });
    expect(errors).toContainEqual({ field: "entity", code: "entity_unknown" });
  });

  it("requires a basis for material amounts (CARA PENGISIAN point 4)", () => {
    const errors = validateLine(line({ basis: "" }), { coa, entities, materialThreshold: money("100000000") });
    expect(errors).toContainEqual({ field: "basis", code: "basis_required" });
  });

  it("rejects negative monthly amounts", () => {
    const months = flat("0");
    months[2] = money("-1");
    expect(validateLine(line({ months }), { coa, entities })).toContainEqual({ field: "months", code: "negative_amount" });
  });

  it("accepts a valid line", () => {
    expect(validateLine(line(), { coa, entities })).toEqual([]);
  });
});

describe("summarize", () => {
  it("groups by category from the COA master, like Rekap section A", () => {
    const lines = [
      line({ id: "a", coaCode: "6241", months: flat("100") }),
      line({ id: "b", coaCode: "5100", months: flat("1000") }),
      line({ id: "c", coaCode: "5100", entity: "MATRIK", months: flat("10") }),
    ];
    const byCategory = summarize(lines, (l) => coa.get(l.coaCode)!.category);
    expect(byCategory.get("OPEX")!.total.toFixed(0)).toBe("1200");
    expect(byCategory.get("COGS")!.total.toFixed(0)).toBe("12120");
    expect(byCategory.get("COGS")!.months[0]!.toFixed(0)).toBe("1010");
  });

  it("groups by entity", () => {
    const lines = [line({ id: "a" }), line({ id: "b", entity: "MATRIK" })];
    const byEntity = summarize(lines, (l) => l.entity);
    expect([...byEntity.keys()].sort()).toEqual(["ESTRADA", "MATRIK"]);
  });
});
