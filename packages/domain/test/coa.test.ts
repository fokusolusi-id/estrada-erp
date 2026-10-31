import { describe, expect, it } from "vitest";
import { remapProblem, variance } from "../src/coa";
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
