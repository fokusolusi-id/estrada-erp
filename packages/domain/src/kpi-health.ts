/** The ten BOD KPIs with their bands, and the stress tests (plan D2; sheet 08_KPI_Thresholds; BR-KPI-004, BR-KPI-005). */
import { money, ZERO, type Money } from "./money";

export const HEALTH_KPIS = ["liquidity", "solvency", "ebitda_margin", "runway", "cash_in", "cash_out", "ending_cash", "ebitda", "budget_use", "capital_efficiency"] as const;
export type HealthKey = (typeof HEALTH_KPIS)[number];
export type Band = "healthy" | "watch" | "critical";
export const BAND_LABEL: Record<Band, string> = { healthy: "SEHAT", watch: "WASPADA", critical: "KRITIS" };

export const HEALTH_INFO: Record<HealthKey, { name: string; formula: string; healthy: string; unit: "times" | "percent" | "months" | "rupiah" }> = {
  liquidity: { name: "Liquidity Ratio", formula: "Aset lancar / liabilitas jangka pendek", healthy: "1,0x – 2,0x", unit: "times" },
  solvency: { name: "Solvency Ratio", formula: "Total liabilitas / total aset", healthy: "0,3 – 0,6", unit: "times" },
  ebitda_margin: { name: "EBITDA Margin", formula: "EBITDA / pendapatan", healthy: "> 15%", unit: "percent" },
  runway: { name: "Cash Runway", formula: "Saldo kas / rata-rata kas keluar 3 bulan", healthy: "> 3 bulan", unit: "months" },
  cash_in: { name: "Cash In Realization", formula: "Kas masuk aktual / rencana Arus Kas", healthy: "≥ 95%", unit: "percent" },
  cash_out: { name: "Cash Out Discipline", formula: "Kas keluar aktual / rencana Arus Kas", healthy: "≤ 100%", unit: "percent" },
  ending_cash: { name: "Ending Cash Balance", formula: "Saldo kas akhir bulan", healthy: "≥ saldo minimum", unit: "rupiah" },
  ebitda: { name: "EBITDA Actual", formula: "Laba sebelum bunga, pajak, penyusutan", healthy: "> 0 (margin ≥ 1%)", unit: "rupiah" },
  budget_use: { name: "Budget Utilization", formula: "Realisasi biaya / budget RKA", healthy: "90% – 100%", unit: "percent" },
  capital_efficiency: { name: "Capital Efficiency", formula: "EBIT disetahunkan / (total aset − liabilitas jangka pendek)", healthy: "> 15%", unit: "percent" },
};

/** The action the sheet suggests when a KPI is not healthy. */
export const HEALTH_ACTION: Record<HealthKey, string> = {
  liquidity: "Percepat cash in dan jaga cash out.",
  solvency: "Pantau ketergantungan terhadap kewajiban.",
  ebitda_margin: "Tinjau profitabilitas operasional.",
  runway: "Amankan pendanaan jangka pendek.",
  cash_in: "Review rencana penagihan.",
  cash_out: "Perketat kontrol belanja.",
  ending_cash: "Jaga saldo di atas safety stock.",
  ebitda: "Tinjau biaya operasional.",
  budget_use: "Kembalikan realisasi biaya ke koridor budget.",
  capital_efficiency: "Tinjau efisiensi modal usaha.",
};

export function healthBand(key: HealthKey, v: Money, context: { safety: Money; ebitdaMargin: Money | null }): Band {
  const band = (healthy: boolean, watch: boolean): Band => (healthy ? "healthy" : watch ? "watch" : "critical");
  const within = (low: number | string, high: number | string) => v.gte(money(String(low))) && v.lte(money(String(high)));
  switch (key) {
    case "liquidity":
      return band(within(1, 2), v.gte(money("0.8")));
    case "solvency":
      return band(within("0.3", "0.6"), within("0.6", "0.7"));
    case "ebitda_margin":
    case "capital_efficiency":
      return band(v.gt(15), v.gte(10));
    case "runway":
      return band(v.gt(3), v.gte(1));
    case "cash_in":
      return band(v.gte(95), v.gte(85));
    case "cash_out":
      return band(v.lte(100), v.lte(110));
    case "ending_cash":
      return band(v.gt(0) && v.gte(context.safety), v.gte(0));
    case "ebitda":
      return band(v.gt(0) && !!context.ebitdaMargin && context.ebitdaMargin.gte(1), v.gte(0));
    case "budget_use":
      return band(within(90, 100), within(80, 110));
  }
}

export interface HealthInput {
  /** The month measured; flow figures are year to date up to it. */
  month: number;
  balance: { currentAssets: Money; currentLiabilities: Money; totalAssets: Money; totalLiabilities: Money } | null;
  pnl: { revenue: Money; ebitda: Money; ebit: Money; cost: Money };
  budgetCost: Money;
  cash: { ending: Money; burn: Money; inActual: Money; inPlan: Money; outActual: Money; outPlan: Money; safety: Money } | null;
}

const over = (a: Money, b: Money, scale = 1, places = 2): Money | null => (b.gt(0) ? a.times(scale).div(b).toDecimalPlaces(places) : null);

export function healthValues({ month, balance: b, pnl, budgetCost, cash }: HealthInput): Record<HealthKey, Money | null> {
  return {
    liquidity: b ? over(b.currentAssets, b.currentLiabilities) : null,
    solvency: b ? over(b.totalLiabilities, b.totalAssets) : null,
    ebitda_margin: over(pnl.ebitda, pnl.revenue, 100),
    runway: cash ? over(cash.ending, cash.burn, 1, 1) : null,
    cash_in: cash ? over(cash.inActual, cash.inPlan, 100, 1) : null,
    cash_out: cash ? over(cash.outActual, cash.outPlan, 100, 1) : null,
    ending_cash: cash ? cash.ending : null,
    ebitda: pnl.revenue.isZero() && pnl.cost.isZero() ? null : pnl.ebitda,
    budget_use: over(pnl.cost, budgetCost, 100, 1),
    capital_efficiency: b ? over(pnl.ebit.times(12).div(month), b.totalAssets.minus(b.currentLiabilities), 100, 1) : null,
  };
}

export const STRESS_CASH_IN_DROP = 20;

/** The forecast's closing balances with less coming in (20% unless asked), and where they are lowest. */
export function stressCashIn(forecast: { closing: readonly Money[]; receipts: readonly Money[] }, drop: number = STRESS_CASH_IN_DROP) {
  let lost = ZERO;
  const closing = forecast.closing.map((c, i) => {
    lost = lost.plus(forecast.receipts[i]!.times(drop).div(100));
    return c.minus(lost);
  });
  const lowest = closing.reduce((a, b) => (b.lt(a) ? b : a), closing[0] ?? ZERO);
  return { lowest, month: closing.findIndex((c) => c.eq(lowest)) + 1 };
}

/** A part's share of a whole in percent, triggered above the limit; null without a whole. */
export function concentration(part: Money, whole: Money, limit: number) {
  if (!whole.gt(0)) return null;
  const share = part.times(100).div(whole).toDecimalPlaces(1);
  return { share, triggered: share.gt(limit) };
}
