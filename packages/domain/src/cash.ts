import Decimal from "decimal.js";
import type { Category } from "./budget";
import { money, sum, ZERO, type Money } from "./money";
import type { Actor } from "./policy";

/**
 * The monthly cash forecast as Forecast CF Bulanan 2027 builds it, per entity; Konsolidasi adds the entities.
 * The P&L comes from the RKA lines; cash follows it with collection and payment lags, tax instalments and loans.
 */

export interface CashLine {
  category: Category;
  coaCode: string;
  months: readonly Money[];
}

export interface CashSettings {
  /** Months between invoice and collection (workbook: 2). */
  collectionLag: number;
  /** Months between COGS and paying the vendor (workbook: 1). OPEX, salaries and interest are paid in the month. */
  cogsPaymentLag: number;
  /** PPh Badan, as a fraction (0.22), paid as twelve equal instalments of the year's profit. */
  taxRate: string;
  /** RKA interest COAs the Obligo schedule replaces. */
  interestCoa: readonly string[];
  /** OPEX COAs that are not cash: depreciation and amortisation. */
  nonCashCoa: readonly string[];
}

/** An entity's position on 1 January, from the balance sheet, and its cash buffer. */
export interface EntityOpening {
  cash: Money;
  /** Collected in January. */
  receivables: Money;
  /** Paid in January. */
  payables: Money;
  /** Last year's PPh 29, paid in April. */
  priorYearTax: Money;
  minimumCash: Money;
}

export interface LoanFlows {
  drawdown: readonly Money[];
  repayment: readonly Money[];
  interest: readonly Money[];
}

export interface Series {
  months: Money[];
  total: Money;
}

export interface CashForecast {
  pnl: {
    revenue: Series;
    cogs: Series;
    opex: Series;
    depreciation: Series;
    others: Series;
    capex: Series;
    tax: Series;
    profitBeforeTax: Money;
  };
  rows: {
    receipts: Money[];
    cogsPaid: Money[];
    opexPaid: Money[];
    interestPaid: Money[];
    taxPaid: Money[];
    operating: Money[];
    capexPaid: Money[];
    financing: Money[];
    net: Money[];
    opening: Money[];
    closing: Money[];
    minimum: Money[];
    surplus: Money[];
    fundingNeed: Money[];
    receivablesEnd: Money[];
    payablesEnd: Money[];
  };
}

const zeros = () => Array.from({ length: 12 }, () => ZERO);
const series = (months: Money[]): Series => ({ months, total: sum(months) });
const add = (a: readonly Money[], b: readonly Money[]) => a.map((x, i) => x.plus(b[i] ?? ZERO));
const neg = (a: readonly Money[]) => a.map((x) => x.negated());
const lagged = (a: readonly Money[], lag: number) => a.map((_, i) => (i - lag >= 0 ? a[i - lag]! : ZERO));
const cents = (x: Money) => x.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Outstanding at month end = previous + drawdown − repayment; interest = outstanding × yearly rate / 12, to the sen. */
export function loanSchedule(
  facility: { openingBalance: Money; rate: string },
  drawdown: readonly Money[],
  repayment: readonly Money[],
): { outstanding: Money[]; interest: Money[] } {
  const outstanding: Money[] = [];
  let balance = facility.openingBalance;
  for (let i = 0; i < 12; i++) {
    balance = balance.plus(drawdown[i] ?? ZERO).minus(repayment[i] ?? ZERO);
    outstanding.push(balance);
  }
  const monthly = money(facility.rate).div(12);
  return { outstanding, interest: outstanding.map((o) => cents(o.times(monthly))) };
}

export function cashForecast(lines: readonly CashLine[], opening: EntityOpening, settings: CashSettings, loans: LoanFlows): CashForecast {
  const by = (keep: (l: CashLine) => boolean) => lines.filter(keep).reduce<Money[]>((acc, l) => add(acc, l.months), zeros());
  const revenue = by((l) => l.category === "Revenue");
  const cogs = by((l) => l.category === "COGS");
  const opexCash = by((l) => l.category === "OPEX" && !settings.nonCashCoa.includes(l.coaCode));
  const depreciation = by((l) => l.category === "OPEX" && settings.nonCashCoa.includes(l.coaCode));
  const others = add(by((l) => l.category === "OTHERS" && !settings.interestCoa.includes(l.coaCode)), loans.interest);
  const capex = by((l) => l.category === "CAPEX");

  const profitBeforeTax = sum(revenue).minus(sum(cogs)).minus(sum(opexCash)).minus(sum(depreciation)).minus(sum(others));
  const instalment = Decimal.max(ZERO, profitBeforeTax).times(money(settings.taxRate)).div(12);
  const tax = zeros().map(() => instalment);

  const firstMonth = (x: Money) => zeros().map((z, i) => (i === 0 ? x : z));
  const receipts = add(lagged(revenue, settings.collectionLag), firstMonth(opening.receivables));
  const cogsPaid = neg(add(lagged(cogs, settings.cogsPaymentLag), firstMonth(opening.payables)));
  const opexPaid = neg(opexCash);
  const interestPaid = neg(others);
  const taxPaid = neg(tax.map((t, i) => (i === 3 ? t.plus(opening.priorYearTax) : t)));
  const operating = receipts.map((x, i) => x.plus(cogsPaid[i]!).plus(opexPaid[i]!).plus(interestPaid[i]!).plus(taxPaid[i]!));
  const capexPaid = neg(capex);
  const financing = loans.drawdown.map((d, i) => d.minus(loans.repayment[i] ?? ZERO));
  const net = operating.map((x, i) => x.plus(capexPaid[i]!).plus(financing[i]!));

  const openingRow: Money[] = [];
  const closing: Money[] = [];
  let balance = opening.cash;
  for (let i = 0; i < 12; i++) {
    openingRow.push(balance);
    balance = balance.plus(net[i]!);
    closing.push(balance);
  }
  const running = (start: Money, inc: readonly Money[], dec: readonly Money[]) => {
    let acc = start;
    return inc.map((x, i) => (acc = acc.plus(x).minus(dec[i]!)));
  };

  return {
    pnl: {
      revenue: series(revenue),
      cogs: series(cogs),
      opex: series(opexCash),
      depreciation: series(depreciation),
      others: series(others),
      capex: series(capex),
      tax: series(tax),
      profitBeforeTax,
    },
    rows: {
      receipts,
      cogsPaid,
      opexPaid,
      interestPaid,
      taxPaid,
      operating,
      capexPaid,
      financing,
      net,
      opening: openingRow,
      closing,
      ...funding(closing, opening.minimumCash),
      receivablesEnd: running(opening.receivables, revenue, receipts),
      payablesEnd: running(opening.payables, cogs, neg(cogsPaid)),
    },
  };
}

function funding(closing: readonly Money[], minimumCash: Money) {
  const minimum = closing.map(() => minimumCash);
  const surplus = closing.map((c) => c.minus(minimumCash));
  return { minimum, surplus, fundingNeed: surplus.map((s) => Decimal.max(ZERO, s.negated())) };
}

/** Konsolidasi: every row is the sum of the entities; the funding need uses the group's own minimum cash. */
export function consolidateCash(forecasts: readonly CashForecast[], minimumCash: Money): CashForecast {
  const sumRows = (pick: (f: CashForecast) => readonly Money[]) => forecasts.reduce<Money[]>((acc, f) => add(acc, pick(f)), zeros());
  const sumSeries = (pick: (f: CashForecast) => Series) => series(sumRows((f) => pick(f).months));
  const closing = sumRows((f) => f.rows.closing);
  return {
    pnl: {
      revenue: sumSeries((f) => f.pnl.revenue),
      cogs: sumSeries((f) => f.pnl.cogs),
      opex: sumSeries((f) => f.pnl.opex),
      depreciation: sumSeries((f) => f.pnl.depreciation),
      others: sumSeries((f) => f.pnl.others),
      capex: sumSeries((f) => f.pnl.capex),
      tax: sumSeries((f) => f.pnl.tax),
      profitBeforeTax: sum(forecasts.map((f) => f.pnl.profitBeforeTax)),
    },
    rows: {
      receipts: sumRows((f) => f.rows.receipts),
      cogsPaid: sumRows((f) => f.rows.cogsPaid),
      opexPaid: sumRows((f) => f.rows.opexPaid),
      interestPaid: sumRows((f) => f.rows.interestPaid),
      taxPaid: sumRows((f) => f.rows.taxPaid),
      operating: sumRows((f) => f.rows.operating),
      capexPaid: sumRows((f) => f.rows.capexPaid),
      financing: sumRows((f) => f.rows.financing),
      net: sumRows((f) => f.rows.net),
      opening: sumRows((f) => f.rows.opening),
      closing,
      ...funding(closing, minimumCash),
      receivablesEnd: sumRows((f) => f.rows.receivablesEnd),
      payablesEnd: sumRows((f) => f.rows.payablesEnd),
    },
  };
}

/** Finance runs the cash forecast and its assumptions; Direktur and Auditor read it. Company-wide figures only. */
export function canCash(actor: Actor, action: "view" | "manage"): boolean {
  if (action === "manage") return actor.role === "finance";
  return actor.role === "finance" || actor.role === "director" || actor.role === "auditor";
}
