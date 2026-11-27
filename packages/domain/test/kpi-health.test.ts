import { describe, expect, it } from "vitest";
import { HEALTH_KPIS, concentration, healthBand, healthValues, stressCashIn, type HealthInput, type HealthKey } from "../src/kpi-health";
import { money } from "../src/money";

const bands = (key: HealthKey, values: string[], extra: { safety?: string; margin?: string } = {}) =>
  values.map((v) => healthBand(key, money(v), { safety: money(extra.safety ?? "0"), ebitdaMargin: money(extra.margin ?? "50") }));

describe("thresholds (sheet 08_KPI_Thresholds; BR-KPI-004)", () => {
  it("has the ten KPIs", () => expect(HEALTH_KPIS).toHaveLength(10));
  it("bands liquidity and solvency", () => {
    expect(bands("liquidity", ["0.79", "0.8", "0.99", "1", "2", "2.01"])).toEqual(["critical", "watch", "watch", "healthy", "healthy", "watch"]);
    expect(bands("solvency", ["0.29", "0.3", "0.6", "0.61", "0.7", "0.71"])).toEqual(["critical", "healthy", "healthy", "watch", "watch", "critical"]);
  });
  it("bands margins, runway and capital efficiency", () => {
    expect(bands("ebitda_margin", ["9.9", "10", "15", "15.1"])).toEqual(["critical", "watch", "watch", "healthy"]);
    expect(bands("capital_efficiency", ["9.9", "15", "16"])).toEqual(["critical", "watch", "healthy"]);
    expect(bands("runway", ["0.9", "1", "3", "3.1"])).toEqual(["critical", "watch", "watch", "healthy"]);
  });
  it("bands cash in, cash out and budget use", () => {
    expect(bands("cash_in", ["84.9", "85", "94.9", "95"])).toEqual(["critical", "watch", "watch", "healthy"]);
    expect(bands("cash_out", ["100", "100.1", "110", "110.1"])).toEqual(["healthy", "watch", "watch", "critical"]);
    expect(bands("budget_use", ["79.9", "80", "89.9", "90", "100", "100.1", "110", "110.1"])).toEqual(["critical", "watch", "watch", "healthy", "healthy", "watch", "watch", "critical"]);
  });
  it("compares ending cash with the safety stock", () => expect(bands("ending_cash", ["-1", "0", "49", "50"], { safety: "50" })).toEqual(["critical", "watch", "watch", "healthy"]));
  it("calls EBITDA under 1% of revenue marginal (client decision)", () => {
    expect([bands("ebitda", ["-1"]), bands("ebitda", ["0"]), bands("ebitda", ["5"], { margin: "0.9" }), bands("ebitda", ["5"], { margin: "1" })].flat()).toEqual(["critical", "watch", "watch", "healthy"]);
  });
});

describe("healthValues", () => {
  const input: HealthInput = {
    month: 6,
    balance: { currentAssets: money("150"), currentLiabilities: money("100"), totalAssets: money("400"), totalLiabilities: money("200") },
    pnl: { revenue: money("1000"), ebitda: money("200"), ebit: money("90"), cost: money("900") },
    budgetCost: money("1000"),
    cash: { ending: money("300"), burn: money("100"), inActual: money("90"), inPlan: money("100"), outActual: money("55"), outPlan: money("50"), safety: money("50") },
  };
  const v = healthValues(input);
  it("computes each KPI, capital efficiency annualised", () => {
    expect(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x?.toString() ?? null]))).toEqual({
      liquidity: "1.5", solvency: "0.5", ebitda_margin: "20", runway: "3", cash_in: "90", cash_out: "110", ending_cash: "300", ebitda: "200", budget_use: "90", capital_efficiency: "60",
    });
  });
  it("has no value where a figure is missing or a divisor is zero", () => {
    const empty = healthValues({ ...input, balance: null, budgetCost: money("0"), cash: null, pnl: { revenue: money("0"), ebitda: money("0"), ebit: money("0"), cost: money("0") } });
    expect(Object.values(empty).filter((x) => x !== null)).toEqual([]);
  });
});

describe("stress tests (BR-KPI-005)", () => {
  it("lowers planned cash in by 20% and finds the lowest month", () => {
    const s = stressCashIn({ closing: [money("100"), money("80")], receipts: [money("50"), money("50")] });
    expect([s.lowest.toString(), s.month]).toEqual(["60", 2]);
  });
  it("flags a concentration above its limit", () => {
    expect(concentration(money("41"), money("100"), 40)).toMatchObject({ triggered: true });
    expect(concentration(money("40"), money("100"), 40)).toMatchObject({ triggered: false });
    expect(concentration(money("1"), money("0"), 40)).toBeNull();
  });
});
