import { describe, expect, it } from "vitest";
import { balanceProblem, closingProblem, monthPnl, type BalanceTotals } from "../src/closing";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import { can, type Actor, type Permission } from "../src/policy";
import { ROLES } from "../src/roles";

const sheet = (over: Partial<Record<keyof BalanceTotals, string>> = {}): BalanceTotals => {
  const v = { currentAssets: "40", totalAssets: "100", currentLiabilities: "20", totalLiabilities: "70", equity: "30", ...over };
  return { currentAssets: money(v.currentAssets), totalAssets: money(v.totalAssets), currentLiabilities: money(v.currentLiabilities), totalLiabilities: money(v.totalLiabilities), equity: money(v.equity) };
};

describe("balance sheet totals (client decision 4; BR-FIN-005)", () => {
  it("accepts consistent totals, negative equity included", () => {
    expect(balanceProblem(sheet())).toBeNull();
    expect(balanceProblem(sheet({ totalLiabilities: "120", equity: "-20" }))).toBeNull();
  });
  it("refuses negative figures and a current part above its total", () => {
    expect(balanceProblem(sheet({ currentAssets: "-1" }))).toBe("negative");
    expect(balanceProblem(sheet({ currentAssets: "101" }))).toBe("current");
    expect(balanceProblem(sheet({ currentLiabilities: "71" }))).toBe("current");
  });
  it("lets a month close only when typed and balanced (client decision)", () => {
    expect(closingProblem(null)).toBe("missing");
    expect(closingProblem(sheet({ equity: "29.99" }))).toBe("unbalanced");
    expect(closingProblem(sheet())).toBeNull();
  });
});

describe("monthPnl", () => {
  const accounts = new Map([
    ["5110", { name: "Subkon", category: "COGS" as const }],
    ["6241", { name: "Perjalanan", category: "OPEX" as const }],
    ["1521", { name: "Peralatan", category: "CAPEX" as const }],
  ]);
  const cost = (coaCode: string | null, amount: string) => ({ coaCode, amount: money(amount) });
  const p = monthPnl({ revenue: [{ coaCode: null, amount: money("1000") }, { coaCode: null, amount: money("500") }], costs: [cost("6241", "50"), cost("5110", "300"), cost("5110", "-20"), cost("1521", "900"), cost(null, "10")], interest: [money("5"), money("2")], accounts });
  it("lists revenue from invoices, then costs per account, then loan interest", () => {
    expect(p.lines.map((l) => [l.coaCode, l.category, l.amount.toString()])).toEqual([
      ["", "Revenue", "1500"],
      ["5110", "COGS", "280"],
      ["6241", "OPEX", "50"],
      ["", "OTHERS", "10"],
      ["7220", "OTHERS", "7"],
    ]);
    expect(p.lines.at(-1)!.name).toBe("Bunga pinjaman");
  });
  it("leaves capital spending out of profit", () => expect([p.revenue, p.cost, p.profit].map(String)).toEqual(["1500", "347", "1153"]));
  it("is empty for a month without postings", () => expect(monthPnl({ revenue: [], costs: [], interest: [], accounts }).lines).toEqual([]));
});

describe("who", () => {
  const org = new OrgTree([{ code: "FRM", parent: null }, { code: "FRM-FIN-ATM", parent: "FRM" }]);
  const allowed = (p: Permission, unit: string) => ROLES.filter((role) => can({ userId: "u", role, orgUnit: unit, entities: ["*"] } as Actor, p, null, org));
  it("has Accounting type the balance sheet; Finance, Direktur, Auditor and the CFO read", () => {
    expect(allowed("balance.record", "FRM-FIN-ATM")).toEqual(["requestor", "default_owner", "division_owner"]);
    expect(allowed("closing.view", "FRM")).toEqual(["division_owner", "finance", "director", "auditor"]);
    expect(allowed("closing.view", "FRM-FIN-ATM")).toEqual(["requestor", "default_owner", "division_owner", "finance", "director", "auditor"]);
  });
});
