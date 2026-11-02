import { describe, expect, it } from "vitest";
import { coaParentProblem, coaSubtree, coaTree, inferCoaParent, remapProblem, variance } from "../src/coa";
import { money } from "../src/money";

describe("variance: 2027 plan against a 2026 figure", () => {
  it("gives the change in rupiah and percent", () => {
    // FRM 6291 depreciation: RKA 2027 133,750,032 vs Actual 2026 127,920,227
    const v = variance(money("133750032"), money("127920227"));
    expect(v.amount.toString()).toBe("5829805");
    expect(v.pct!.toFixed(1)).toBe("4.6");
  });

  it("has no percent when there is nothing to compare with", () => {
    expect(variance(money("1000"), null).pct).toBeNull();
    expect(variance(money("1000"), money("0")).pct).toBeNull();
    expect(variance(money("1000"), null).amount.toString()).toBe("1000");
  });
});

describe("remapProblem: moving lines off a provisional COA code", () => {
  const source = { code: "4300", category: "Revenue" as const, provisional: true };
  const target = { code: "4200", category: "Revenue" as const, active: true, provisional: false };

  it("allows a provisional code onto an active code of the same category", () => {
    expect(remapProblem(source, target, 0)).toBeNull();
  });

  it("refuses what would change the books or lose history", () => {
    expect(remapProblem({ ...source, provisional: false }, target, 0)).toBe("source_not_provisional");
    expect(remapProblem(source, undefined, 0)).toBe("target_missing");
    expect(remapProblem(source, { ...target, code: "4300" }, 0)).toBe("same_code");
    expect(remapProblem(source, { ...target, active: false }, 0)).toBe("target_inactive");
    expect(remapProblem(source, { ...target, provisional: true }, 0)).toBe("target_provisional");
    expect(remapProblem(source, { ...target, category: "OPEX" }, 0)).toBe("category_mismatch");
    expect(remapProblem(source, target, 3)).toBe("locked_lines");
  });
});

// Codes and categories from the workbook's COA Master.
const acc = (code: string, category: "COGS" | "OPEX" | "CAPEX" = "OPEX", parentCode: string | null = null) => ({ code, category, parentCode });
const MASTER = [
  acc("5500", "COGS"), acc("5510", "COGS"), acc("5520", "COGS"), acc("5100", "COGS"), acc("5100-1", "CAPEX"),
  acc("6100"), acc("6131"), acc("6130-S2"), acc("6210"), acc("6211"), acc("6220"), acc("6221"),
];

describe("inferCoaParent: the tree the code numbers already imply", () => {
  it("puts 5510 and 5520 under 5500, as the client's example does", () => {
    expect(inferCoaParent("5510", MASTER)).toBe("5500");
    expect(inferCoaParent("5520", MASTER)).toBe("5500");
  });

  it("uses the nearest code that exists: 6211 under 6210, 6131 under 6100 when there is no 6130", () => {
    expect(inferCoaParent("6211", MASTER)).toBe("6210");
    expect(inferCoaParent("6221", MASTER)).toBe("6220");
    expect(inferCoaParent("6131", MASTER)).toBe("6100");
    expect(inferCoaParent("6130-S2", MASTER)).toBe("6100");
  });

  it("leaves a top code, or one whose candidate sits in another category, at the root", () => {
    expect(inferCoaParent("5500", MASTER)).toBeNull();
    expect(inferCoaParent("6210", MASTER)).toBeNull();
    expect(inferCoaParent("5100-1", MASTER)).toBeNull(); // CAPEX under a COGS code would move totals between rows
  });
});

describe("coaParentProblem: what Finance may set as a parent", () => {
  const tree = [acc("5500", "COGS"), acc("5510", "COGS", "5500"), acc("5511", "COGS", "5510"), acc("6210")];

  it("accepts a parent in the same category, or none", () => {
    expect(coaParentProblem("5520", "5500", tree, "COGS")).toBeNull();
    expect(coaParentProblem("5510", null, tree, "COGS")).toBeNull();
  });

  it("refuses itself, a missing code, another category, and its own descendant", () => {
    expect(coaParentProblem("5500", "5500", tree, "COGS")).toBe("self");
    expect(coaParentProblem("5520", "5999", tree, "COGS")).toBe("missing");
    expect(coaParentProblem("5520", "6210", tree, "COGS")).toBe("category_mismatch");
    expect(coaParentProblem("5500", "5511", tree, "COGS")).toBe("cycle");
  });
});

describe("coaTree and coaSubtree", () => {
  const tree = [acc("6220"), acc("5510", "COGS", "5500"), acc("6221", "OPEX", "6220"), acc("5500", "COGS"), acc("5520", "COGS", "5500"), acc("7777", "OPEX", "gone")];

  it("lists parents before their children, in code order, with depth for indenting", () => {
    expect(coaTree(tree).map((n) => [n.account.code, n.depth])).toEqual([
      ["5500", 0], ["5510", 1], ["5520", 1], ["6220", 0], ["6221", 1], ["7777", 0],
    ]);
  });

  it("gives a code with everything under it, so filtering on 5500 shows 5510 and 5520", () => {
    expect([...coaSubtree("5500", tree)].sort()).toEqual(["5500", "5510", "5520"]);
    expect([...coaSubtree("5510", tree)]).toEqual(["5510"]);
  });
});
