import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import { ROLES, type Role } from "../src/roles";
import { canNoteVariance, varianceOf } from "../src/variance";
import { money } from "../src/money";

const of = (budget: string, actual: string) => varianceOf(money(budget), money(actual));

describe("varianceOf (37_Variance_Analysis: ±5% Watch, ±10% Investigate, ±15% Escalate)", () => {
  it("bands the variance against budget to date, either way", () => {
    expect(["104.9", "105", "90.1", "90", "115", "0"].map((a) => of("100", a)!.severity)).toEqual(["ok", "watch", "watch", "investigate", "escalate", "escalate"]);
  });
  it("signs the amount and percent: negative is under-spend", () => {
    const v = of("2000", "1500")!;
    expect([v.amount.toString(), v.percent.toString(), v.direction]).toEqual(["-500", "-25", "under"]);
    expect(of("100", "120")!.direction).toBe("over");
  });
  it("escalates spending that has no budget to date, and says nothing when both are zero", () => {
    expect(of("0", "10")).toMatchObject({ severity: "escalate", direction: "over", percent: money("100") });
    expect(of("0", "0")).toBeNull();
  });
  it("writes the sentence the sheet writes", () => {
    expect(of("2000", "1500")!.sentence("SCM", "Rp 500")).toBe("SCM di bawah budget periode sebesar Rp 500 (25,0%). Status: variance signifikan butuh eskalasi BOD. Underspend bisa indikasi project delay: konfirmasi dengan PIC.");
    expect(of("100", "107")!.sentence("BCD", "Rp 7")).toBe("BCD di atas budget periode sebesar Rp 7 (7,0%). Status: variance perlu dipantau. Periksa pendorong biaya sebelum pembayaran berikutnya.");
    expect(of("100", "101")!.sentence("BCD", "Rp 1")).toBe("BCD di atas budget periode sebesar Rp 1 (1,0%). Status: dalam batas wajar.");
  });
});

describe("canNoteVariance: the cost center's owner writes the root cause", () => {
  const org = new OrgTree([{ code: "DIR", parent: null }, { code: "PDMS", parent: "DIR" }, { code: "SCM", parent: "PDMS" }, { code: "BCD", parent: "DIR" }]);
  const allowed = (unit: string) => ROLES.filter((r: Role) => canNoteVariance({ userId: "u", role: r, orgUnit: "PDMS", entities: ["*"] } as Actor, unit, org));
  it("lets the heads over the unit write, and nobody else", () => {
    expect(allowed("SCM")).toEqual(["default_owner", "division_owner"]);
    expect(allowed("BCD")).toEqual([]);
  });
});
