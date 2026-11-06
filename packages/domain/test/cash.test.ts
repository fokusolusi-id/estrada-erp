import { describe, expect, it } from "vitest";
import { canCash, cashForecast, consolidateCash, loanSchedule, type CashLine, type CashSettings, type EntityOpening } from "../src/cash";
import { money, ZERO } from "../src/money";
import type { Actor } from "../src/policy";

const m = (...v: number[]) => Array.from({ length: 12 }, (_, i) => money(v[i] ?? 0));
const flat = (v: number) => m(...Array.from({ length: 12 }, () => v));
const r = (ms: { toFixed(d: number): string }[]) => ms.map((x) => Number(x.toFixed(2)));

// The Forecast CF Bulanan 2027 rules, on round numbers.
const settings: CashSettings = {
  collectionLag: 2,
  cogsPaymentLag: 1,
  taxRate: "0.22",
  interestCoa: ["7221"],
  nonCashCoa: ["6291"],
};
const opening: EntityOpening = { cash: money(100), receivables: money(40), payables: money(30), priorYearTax: money(12), minimumCash: money(50) };
const lines: CashLine[] = [
  { category: "Revenue", coaCode: "4100", months: m(120, 0, 120, 0, 0, 0, 0, 0, 0, 0, 0, 120) },
  { category: "COGS", coaCode: "5300", months: flat(10) },
  { category: "OPEX", coaCode: "6211", months: flat(5) },
  { category: "OPEX", coaCode: "6291", months: flat(1) },
  { category: "OTHERS", coaCode: "7210", months: flat(1) },
  { category: "OTHERS", coaCode: "7221", months: flat(100) },
  { category: "CAPEX", coaCode: "1615", months: m(24) },
];

describe("loanSchedule: Obligo per facility", () => {
  it("charges interest on the month-end outstanding at the yearly rate / 12", () => {
    const s = loanSchedule({ openingBalance: money("40782658280.84"), rate: "0.10" }, m(), m());
    expect(s.outstanding[11]!.toFixed(2)).toBe("40782658280.84");
    expect(s.interest[0]!.toFixed(2)).toBe("339855485.67");
  });

  it("adds drawdowns and takes off repayments before charging interest", () => {
    const s = loanSchedule({ openingBalance: money(1200), rate: "0.12" }, m(0, 600), m(0, 0, 300));
    expect(r(s.outstanding.slice(0, 3))).toEqual([1200, 1800, 1500]);
    expect(r(s.interest.slice(0, 3))).toEqual([12, 18, 15]);
  });
});

describe("cashForecast: one entity's year, month by month", () => {
  const loans = { drawdown: m(0, 50), repayment: m(), interest: flat(2) };
  const f = cashForecast(lines, opening, settings, loans);

  it("builds the P&L the cash rows start from: depreciation counted, RKA interest replaced by Obligo interest", () => {
    expect(f.pnl.revenue.total.toFixed(0)).toBe("360");
    expect(f.pnl.depreciation.total.toFixed(0)).toBe("12");
    // 7210 (12) + Obligo interest (24); the RKA's 7221 interest (1.200) is replaced.
    expect(f.pnl.others.total.toFixed(0)).toBe("36");
    // 360 - 120 - 60 - 12 - 36
    expect(f.pnl.profitBeforeTax.toFixed(0)).toBe("132");
  });

  it("collects invoices after the lag, plus opening receivables in January", () => {
    expect(r(f.rows.receipts.slice(0, 4))).toEqual([40, 0, 120, 0]);
    expect(r(f.rows.receipts.slice(11))).toEqual([0]);
  });

  it("pays COGS a month late, plus opening payables in January; OPEX cash leaves depreciation out", () => {
    expect(r(f.rows.cogsPaid.slice(0, 2))).toEqual([-30, -10]);
    expect(r(f.rows.opexPaid.slice(0, 1))).toEqual([-5]);
    expect(r(f.rows.interestPaid.slice(0, 1))).toEqual([-3]);
  });

  it("pays tax in twelve instalments of the year's profit, plus last year's PPh 29 in April", () => {
    // 132 x 22% / 12 = 2,42
    expect(r(f.rows.taxPaid.slice(0, 4))).toEqual([-2.42, -2.42, -2.42, -14.42]);
  });

  it("runs the balance from the opening cash and shows the funding needed below the minimum", () => {
    // Jan: 40 - 30 - 5 - 3 - 2,42 - 24 capex = -24,42 → 75,58
    expect(f.rows.closing[0]!.toFixed(2)).toBe("75.58");
    expect(f.rows.opening[1]!.toFixed(2)).toBe("75.58");
    // Feb: 0 - 10 - 5 - 3 - 2,42 + 50 drawdown = 29,58 → 105,16
    expect(f.rows.closing[1]!.toFixed(2)).toBe("105.16");
    expect(f.rows.fundingNeed.every((x) => x.gte(ZERO))).toBe(true);
    const lowest = f.rows.closing.reduce((a, b) => (b.lt(a) ? b : a));
    expect(f.rows.fundingNeed[f.rows.closing.indexOf(lowest)]!.toFixed(2)).toBe(lowest.lt(50) ? money(50).minus(lowest).toFixed(2) : "0.00");
  });

  it("tracks receivables and vendor payables at month end", () => {
    expect(r(f.rows.receivablesEnd.slice(0, 3))).toEqual([120, 120, 120]);
    expect(r(f.rows.payablesEnd.slice(0, 2))).toEqual([10, 10]);
  });

  it("pays no tax on a loss", () => {
    const loss = cashForecast([{ category: "OPEX", coaCode: "6211", months: flat(10) }], opening, settings, { drawdown: m(), repayment: m(), interest: m() });
    expect(loss.rows.taxPaid.every((x) => x.isZero() || x.eq(-12))).toBe(true);
  });
});

describe("consolidateCash: the Konsolidasi sheet adds the entities, with its own minimum cash", () => {
  it("sums every row and takes the group's minimum for the funding need", () => {
    const a = cashForecast(lines, opening, settings, { drawdown: m(), repayment: m(), interest: m() });
    const c = consolidateCash([a, a], money(150));
    expect(c.rows.closing[0]!.toFixed(2)).toBe(a.rows.closing[0]!.times(2).toFixed(2));
    expect(c.rows.minimum[0]!.toFixed(0)).toBe("150");
    expect(c.rows.fundingNeed[0]!.toFixed(2)).toBe(money(150).minus(a.rows.closing[0]!.times(2)).isNegative() ? "0.00" : money(150).minus(a.rows.closing[0]!.times(2)).toFixed(2));
  });
});

describe("canCash: Finance runs the forecast; Direktur and Auditor read it", () => {
  const actor = (role: Actor["role"]): Actor => ({ userId: "u", role, orgUnit: "FRM", entities: ["*"] });

  it("lets Finance change assumptions and loans", () => {
    expect(canCash(actor("finance"), "manage")).toBe(true);
    expect(canCash(actor("director"), "manage")).toBe(false);
  });

  it("shows the forecast to Finance, Direktur and Auditor only", () => {
    for (const role of ["finance", "director", "auditor"] as const) expect(canCash(actor(role), "view")).toBe(true);
    for (const role of ["requestor", "default_owner", "division_owner", "admin"] as const) expect(canCash(actor(role), "view")).toBe(false);
  });
});
