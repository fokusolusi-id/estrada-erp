import { describe, expect, it } from "vitest";
import { money, sum } from "../src/money";
import { DEFAULT_SCENARIOS, DEFAULT_SEASONALITY, burnAndRunway, scenarioForecast, scenarioProblem, sensitivity, splitBySeason } from "../src/scenario";

const normal = DEFAULT_SCENARIOS.normal;
const zero = money("0");
const flat = Array.from({ length: 12 }, () => zero);
const opening = { cash: money("35000000000"), receivables: zero, payables: zero, priorYearTax: zero, minimumCash: money("20000000000") };

describe("splitBySeason (sheets 22_Assumptions, 23_Revenue_Projection)", () => {
  it("shares the year by month, adding up to it", () => {
    const m = splitBySeason(money(normal.revenue), DEFAULT_SEASONALITY);
    expect([m[0]!.toString(), m[11]!.toString(), sum(m).toString()]).toEqual(["22500000000", "54000000000", "450000000000"]);
    expect(sum(splitBySeason(money("100.01"), DEFAULT_SEASONALITY)).toString()).toBe("100.01");
  });
});

describe("scenarioForecast (client decision: Arus Kas rules with DSO and DPO as lags)", () => {
  const f = scenarioForecast(normal, DEFAULT_SEASONALITY, opening, { drawdown: flat, repayment: flat, interest: flat });
  it("takes costs as a share of revenue and depreciation as a twelfth of capex (sheet 25_PnL_Dashboard)", () => {
    expect([f.pnl.cogs.months[0]!.toString(), f.pnl.opex.months[0]!.toString(), f.pnl.depreciation.months[0]!.toString()]).toEqual(["16200000000", "2700000000", "1000000000"]);
    expect(f.pnl.profitBeforeTax.toString()).toBe("60000000000");
  });
  it("collects after DSO and pays vendors after DPO", () => {
    expect(f.rows.receipts.slice(0, 4).map(String)).toEqual(["0", "0", "0", "22500000000"]);
    expect(f.rows.cogsPaid.slice(0, 3).map(String)).toEqual(["0", "0", "-16200000000"]);
  });
  it("keeps depreciation out of cash", () => expect(f.rows.opexPaid[0]!.toString()).toBe("-2700000000"));
});

describe("burnAndRunway (sheet 26_Cashflow_Forecast)", () => {
  it("averages the last three months of cash out and says how long the balance lasts", () => {
    const r = burnAndRunway({ opexPaid: [-10, -20, -30, -40].map((n) => money(String(n))), closing: [100, 90, 40, -5].map((n) => money(String(n))) });
    expect(r.burn.map(String)).toEqual(["10", "15", "20", "30"]);
    expect(r.runway.map((x) => x?.toString() ?? null)).toEqual(["10", "6", "2", "0"]);
  });
});

describe("sensitivity (sheet 30_Scenario_Sensitivity)", () => {
  const s = sensitivity(normal);
  it("crosses COGS % with OpEx % around the scenario", () => {
    expect([s.cogs.map(String).join(","), s.opex.map(String).join(",")]).toEqual(["66,68,70,72,74,76,78", "9,10,11,12,13,14,15"]);
    expect(s.cells[3]![3]!.netProfit.toString()).toBe("56160000000");
    expect(s.cells[0]![0]!.netProfit.toString()).toBe("87750000000");
    expect(s.cells[3]![3]!.ebitdaMargin.toString()).toBe("16");
  });
  it("taxes no loss", () => {
    const loss = sensitivity({ ...normal, cogsPct: "99", opexPct: "10" });
    expect(loss.cells[3]![3]!.netProfit.toString()).toBe("-40500000000");
  });
});

describe("scenarioProblem", () => {
  const ok = { scenarios: DEFAULT_SCENARIOS, seasonality: [...DEFAULT_SEASONALITY] };
  it("checks the figures and that the months make 100%", () => {
    expect(scenarioProblem(ok)).toBeNull();
    expect(scenarioProblem({ ...ok, seasonality: ok.seasonality.map((v, i) => (i === 0 ? "6" : v)) })).toBe("season");
    expect(scenarioProblem({ ...ok, scenarios: { ...DEFAULT_SCENARIOS, normal: { ...normal, cogsPct: "101" } } })).toBe("percent");
    expect(scenarioProblem({ ...ok, scenarios: { ...DEFAULT_SCENARIOS, normal: { ...normal, dso: 400 } } })).toBe("days");
    expect(scenarioProblem({ ...ok, scenarios: { ...DEFAULT_SCENARIOS, normal: { ...normal, revenue: "-1" } } })).toBe("amount");
  });
});
