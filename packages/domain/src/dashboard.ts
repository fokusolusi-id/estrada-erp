import type { ApprovalState } from "./approval";
import { APPROVAL_STATES } from "./approval";
import type { Category } from "./budget";
import { sum, ZERO, type Money } from "./money";

type Headline = "Revenue" | "TotalCost" | "ProfitBeforeTax" | "CAPEX";

/**
 * The Summary's change badges, like for like: RKA 2026 against the 2027 plan over the same lines, those that carry
 * a 2026 figure, so a line new in 2027 does not read as growth. Total cost and profit follow the workbook
 * (CAPEX counts in cost, not in profit).
 */
export function headlinePrior(lines: readonly { category: Category; priorRka?: Money | null; months: readonly Money[] }[]) {
  const covered = lines.filter((l) => l.priorRka);
  const totals = (value: (l: (typeof covered)[number]) => Money): Record<Headline, Money> => {
    const by = (c: Category) => sum(covered.filter((l) => l.category === c).map(value));
    const opCost = by("COGS").plus(by("OPEX")).plus(by("OTHERS"));
    return { Revenue: by("Revenue"), TotalCost: opCost.plus(by("CAPEX")), ProfitBeforeTax: by("Revenue").minus(opCost), CAPEX: by("CAPEX") };
  };
  const base = totals((l) => l.priorRka!);
  const plan = totals((l) => sum([...l.months]));
  return {
    base,
    plan,
    covered: covered.length,
    of: lines.length,
    /** Percent change, or null when there is no positive 2026 figure to compare with. */
    change: (key: Headline): Money | null => (base[key].gt(0) ? plan[key].minus(base[key]).div(base[key]).times(100) : null),
  };
}

export interface DivisionProgress {
  division: string;
  total: number;
  counts: Record<ApprovalState, number>;
  /** Percent of lines finalised or locked, rounded. */
  finalShare: number;
}

/** Lines per division and approval state, for the cycle progress board. Divisions in name order. */
export function cycleProgress(lines: readonly { ownerUnit: string; state: ApprovalState }[], divisionOf: (unit: string) => string): DivisionProgress[] {
  const out = new Map<string, DivisionProgress>();
  for (const l of lines) {
    const division = divisionOf(l.ownerUnit);
    const row = out.get(division) ?? { division, total: 0, counts: Object.fromEntries(APPROVAL_STATES.map((s) => [s, 0])) as Record<ApprovalState, number>, finalShare: 0 };
    row.total += 1;
    row.counts[l.state] += 1;
    out.set(division, row);
  }
  return [...out.values()]
    .map((r) => ({ ...r, finalShare: Math.round(((r.counts.awaiting_lock + r.counts.locked) / r.total) * 100) }))
    .sort((a, b) => a.division.localeCompare(b.division));
}

export interface WaterfallStep {
  key: "opening" | "receipts" | "cogs" | "opex" | "interest" | "tax" | "capex" | "financing" | "closing";
  start: Money;
  end: Money;
}

/** The year's cash bridge: opening balance, each flow for the year, closing balance. */
export function cashWaterfall(rows: {
  opening: readonly Money[];
  receipts: readonly Money[];
  cogsPaid: readonly Money[];
  opexPaid: readonly Money[];
  interestPaid: readonly Money[];
  taxPaid: readonly Money[];
  capexPaid: readonly Money[];
  financing: readonly Money[];
  closing: readonly Money[];
}): WaterfallStep[] {
  const opening = rows.opening[0] ?? ZERO;
  const steps: WaterfallStep[] = [{ key: "opening", start: ZERO, end: opening }];
  let at = opening;
  const flows: [WaterfallStep["key"], readonly Money[]][] = [
    ["receipts", rows.receipts],
    ["cogs", rows.cogsPaid],
    ["opex", rows.opexPaid],
    ["interest", rows.interestPaid],
    ["tax", rows.taxPaid],
    ["capex", rows.capexPaid],
    ["financing", rows.financing],
  ];
  for (const [key, months] of flows) {
    const next = at.plus(sum([...months]));
    steps.push({ key, start: at, end: next });
    at = next;
  }
  steps.push({ key: "closing", start: ZERO, end: rows.closing[11] ?? at });
  return steps;
}
