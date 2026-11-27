import type { ApprovalState } from "./approval";
import { APPROVAL_STATES } from "./approval";
import type { Category } from "./budget";
import type { Role } from "./roles";
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

/** Lines Finance has not finalised: what a report that includes them may still change by. */
export function notFinal(lines: readonly { state: ApprovalState }[]): number {
  return lines.filter((l) => l.state !== "awaiting_lock" && l.state !== "locked").length;
}

/** The lines behind a status board cell. A state the cycle does not have filters nothing. */
export function filterByBoard<L extends { ownerUnit: string; state: ApprovalState }>(
  lines: readonly L[],
  filter: { division?: string | undefined; state?: string | undefined },
  divisionOf: (unit: string) => string,
): L[] {
  const state = APPROVAL_STATES.find((s) => s === filter.state);
  return lines.filter((l) => (!state || l.state === state) && (!filter.division || divisionOf(l.ownerUnit) === filter.division));
}

export interface PendingStage {
  state: ApprovalState;
  /** The seat that moves lines on from this state. */
  role: Role;
  count: number;
  /** The divisions holding them, most lines first. */
  divisions: { division: string; count: number }[];
}

const HOLDER = { draft: "requestor", consolidation: "default_owner", division_approval: "division_owner", finance_review: "finance" } as const satisfies Partial<Record<ApprovalState, Role>>;

/** Where the unfinished lines are waiting, in cycle order. */
export function pendingByStage(lines: readonly { state: ApprovalState; ownerUnit: string }[], divisionOf: (unit: string) => string): PendingStage[] {
  return (Object.keys(HOLDER) as (keyof typeof HOLDER)[]).flatMap((state) => {
    const held = lines.filter((l) => l.state === state);
    if (!held.length) return [];
    const by = new Map<string, number>();
    for (const l of held) by.set(divisionOf(l.ownerUnit), (by.get(divisionOf(l.ownerUnit)) ?? 0) + 1);
    const divisions = [...by].map(([division, count]) => ({ division, count })).sort((a, b) => b.count - a.count || a.division.localeCompare(b.division));
    return [{ state, role: HOLDER[state], count: held.length, divisions }];
  });
}

/** Lines moved together are logged one by one, moments apart. */
const SAME_HANDOFF_MS = 2 * 60 * 1000;

/** Folds each handoff (same person, same action, moments apart) into one activity entry, newest first. */
export function groupActivity<E extends { actorName: string; action: string; at: string }>(events: readonly E[]) {
  const groups: { actorName: string; action: E["action"]; at: string; events: E[] }[] = [];
  for (const e of [...events].sort((a, b) => b.at.localeCompare(a.at))) {
    const last = groups.at(-1);
    const previous = last?.events.at(-1);
    if (last && previous && last.actorName === e.actorName && last.action === e.action && Date.parse(previous.at) - Date.parse(e.at) <= SAME_HANDOFF_MS) last.events.push(e);
    else groups.push({ actorName: e.actorName, action: e.action, at: e.at, events: [e] });
  }
  return groups;
}

/** A position's entities as a person reads them. */
export function entityScopeLabel(entities: readonly string[]): string {
  return entities.includes("*") ? "Semua entitas" : `Entitas: ${entities.join(", ")}`;
}
