/** Scenario projection and sensitivity (plan E6; sheets 22_Assumptions, 23, 25, 26, 30_Scenario_Sensitivity). */
import Decimal from "decimal.js";
import { cashForecast, type CashForecast, type CashLine, type EntityOpening, type LoanFlows } from "./cash";
import { money, sum, ZERO, type Money } from "./money";

export const SCENARIOS = ["conservative", "normal", "aggressive"] as const;
export type ScenarioKey = (typeof SCENARIOS)[number];
export const SCENARIO_LABEL: Record<ScenarioKey, string> = { conservative: "Conservative", normal: "Normal", aggressive: "Aggressive" };

/** One scenario's drivers; amounts and percentages as plain decimal strings. */
export interface ScenarioDrivers {
  revenue: string;
  cogsPct: string;
  opexPct: string;
  taxPct: string;
  dso: number;
  dpo: number;
  capex: string;
}

/** The FY2026 values of sheet 22_Assumptions, the starting point Finance edits. */
export const DEFAULT_SCENARIOS: Record<ScenarioKey, ScenarioDrivers> = {
  conservative: { revenue: "380000000000", cogsPct: "78", opexPct: "14", taxPct: "22", dso: 120, dpo: 45, capex: "15000000000" },
  normal: { revenue: "450000000000", cogsPct: "72", opexPct: "12", taxPct: "22", dso: 90, dpo: 60, capex: "12000000000" },
  aggressive: { revenue: "520000000000", cogsPct: "68", opexPct: "10", taxPct: "22", dso: 60, dpo: 75, capex: "18000000000" },
};
/** Percent of the year's revenue per month, January first (sheet 22_Assumptions). */
export const DEFAULT_SEASONALITY: readonly string[] = ["5", "5", "7", "7", "8", "9", "8", "9", "10", "10", "10", "12"];

const pct = (v: Money, p: string) => v.times(money(p)).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** The year shared by month; December takes the rounding. */
export function splitBySeason(total: Money, seasonality: readonly string[]): Money[] {
  const first = seasonality.slice(0, 11).map((p) => pct(total, p));
  return [...first, total.minus(sum(first))];
}

const DEPRECIATION = "depreciation";

/** A scenario run through the Arus Kas rules: DSO and DPO become month lags, depreciation (capex / 12) is not cash. */
export function scenarioForecast(d: ScenarioDrivers, seasonality: readonly string[], opening: EntityOpening, loans: LoanFlows): CashForecast {
  const revenue = splitBySeason(money(d.revenue), seasonality);
  const twelfth = splitBySeason(money(d.capex), Array.from({ length: 12 }, () => new Decimal(100).div(12).toFixed(10)));
  const lines: CashLine[] = [
    { category: "Revenue", coaCode: "revenue", months: revenue },
    { category: "COGS", coaCode: "cogs", months: revenue.map((r) => pct(r, d.cogsPct)) },
    { category: "OPEX", coaCode: "opex", months: revenue.map((r) => pct(r, d.opexPct)) },
    { category: "OPEX", coaCode: DEPRECIATION, months: twelfth },
    { category: "CAPEX", coaCode: "capex", months: twelfth },
  ];
  return cashForecast(
    lines,
    opening,
    {
      collectionLag: Math.round(d.dso / 30),
      cogsPaymentLag: Math.round(d.dpo / 30),
      taxRate: money(d.taxPct).div(100).toFixed(),
      interestCoa: [],
      nonCashCoa: [DEPRECIATION],
    },
    loans,
  );
}

/** Cash going out, averaged over the last three months, and how many months the closing balance covers it. */
export function burnAndRunway(rows: Partial<Pick<CashForecast["rows"], "cogsPaid" | "opexPaid" | "interestPaid" | "taxPaid" | "capexPaid">> & { closing: readonly Money[] }) {
  const out = rows.closing.map((_, i) => sum([rows.cogsPaid, rows.opexPaid, rows.interestPaid, rows.taxPaid, rows.capexPaid].map((r) => r?.[i] ?? ZERO)).negated());
  const burn = out.map((_, i) => {
    const window = out.slice(Math.max(0, i - 2), i + 1);
    return sum(window).div(window.length).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  });
  /** Null when nothing goes out. */
  const runway = rows.closing.map((c, i) => (burn[i]!.gt(0) ? Decimal.max(ZERO, c.div(burn[i]!)).toDecimalPlaces(1) : null));
  return { burn, runway };
}

const around = (base: Money, step: number) => [-3, -2, -1, 0, 1, 2, 3].map((k) => base.plus(k * step));

/** Net profit and EBITDA margin over COGS % (steps of 2) by OpEx % (steps of 1) around a scenario. A loss pays no tax. */
export function sensitivity(d: ScenarioDrivers) {
  const [cogs, opex] = [around(money(d.cogsPct), 2), around(money(d.opexPct), 1)];
  const revenue = money(d.revenue);
  const cells = cogs.map((c) =>
    opex.map((o) => {
      const ebitdaMargin = money("100").minus(c).minus(o);
      const before = revenue.times(ebitdaMargin).div(100);
      const tax = Decimal.max(ZERO, before).times(money(d.taxPct)).div(100);
      return { ebitdaMargin, netProfit: before.minus(tax).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) };
    }),
  );
  return { cogs, opex, cells };
}

export function scenarioProblem(v: { scenarios: Record<ScenarioKey, ScenarioDrivers>; seasonality: readonly string[] }): "amount" | "percent" | "days" | "season" | null {
  const plain = /^\d+(\.\d{1,2})?$/;
  const percent = (s: string) => plain.test(s) && Number(s) <= 100;
  for (const d of SCENARIOS.map((k) => v.scenarios[k])) {
    if (![d.revenue, d.capex].every((a) => plain.test(a))) return "amount";
    if (![d.cogsPct, d.opexPct, d.taxPct].every(percent)) return "percent";
    if (![d.dso, d.dpo].every((n) => Number.isInteger(n) && n >= 0 && n <= 360)) return "days";
  }
  return v.seasonality.length === 12 && v.seasonality.every(percent) && sum(v.seasonality.map((s) => money(s))).eq(100) ? null : "season";
}
