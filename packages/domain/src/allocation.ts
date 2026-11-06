import Decimal from "decimal.js";
import { parseIdr } from "./entry";
import { sum, ZERO, type Money } from "./money";
import type { Contribution, SummaryLine } from "./summary";

/** How a shared cost splits across the entities (client decision: all three, chosen per line by Finance). */
export const ALLOCATION_BASES = ["revenue", "headcount", "fixed"] as const;
export type AllocationBasis = (typeof ALLOCATION_BASES)[number];

export const BASIS_LABEL: Record<AllocationBasis, string> = {
  revenue: "Porsi pendapatan",
  headcount: "Headcount",
  fixed: "Persentase tetap",
};

export interface SharedRule {
  basis: AllocationBasis;
  /** Percent per entity as typed, for the fixed basis; an entity left out gets nothing. */
  fixed?: Readonly<Record<string, string>>;
}

export interface AllocationContext {
  /** Every entity a shared cost may land on, ESTRADA included (four-way split). */
  entities: readonly string[];
  revenue: ReadonlyMap<string, Money>;
  headcount: ReadonlyMap<string, number>;
}

export type AllocationProblem =
  | "no_revenue"
  | "no_headcount"
  | "fixed_not_100"
  | "fixed_negative"
  | "fixed_invalid"
  | "fixed_unknown_entity";

export const ALLOCATION_PROBLEM_LABEL: Record<AllocationProblem, string> = {
  no_revenue: "Belum ada pendapatan untuk dijadikan dasar",
  no_headcount: "Headcount per entitas belum diisi",
  fixed_not_100: "Persentase harus berjumlah 100",
  fixed_negative: "Persentase tidak boleh negatif",
  fixed_invalid: "Persentase bukan angka",
  fixed_unknown_entity: "Entitas tidak dikenal",
};

/** Revenue per entity for the year, the revenue-share basis. */
export function revenueByEntity(lines: readonly SummaryLine[]): Map<string, Money> {
  const out = new Map<string, Money>();
  for (const l of lines) if (l.category === "Revenue") out.set(l.entity, (out.get(l.entity) ?? ZERO).plus(sum(l.months)));
  return out;
}

function readPercents(fixed: Readonly<Record<string, string>>): Map<string, Decimal> | null {
  const out = new Map<string, Decimal>();
  for (const [entity, raw] of Object.entries(fixed)) {
    if (!raw.trim()) continue;
    try {
      out.set(entity, parseIdr(raw));
    } catch {
      return null;
    }
  }
  return out;
}

export function fixedProblem(fixed: Readonly<Record<string, string>>, entities: readonly string[]): AllocationProblem | null {
  const percents = readPercents(fixed);
  if (!percents) return "fixed_invalid";
  if ([...percents.keys()].some((e) => !entities.includes(e))) return "fixed_unknown_entity";
  if ([...percents.values()].some((p) => p.isNegative())) return "fixed_negative";
  if (!sum([...percents.values()]).eq(100)) return "fixed_not_100";
  return null;
}

function proportional(weights: ReadonlyMap<string, Decimal>, entities: readonly string[]): Map<string, Decimal> | null {
  const total = sum(entities.map((e) => weights.get(e) ?? ZERO));
  if (total.lte(0)) return null;
  return new Map(entities.map((e) => [e, (weights.get(e) ?? ZERO).div(total)]));
}

/** Each entity's fraction of a shared cost; the fractions add up to 1. */
export function allocationShares(rule: SharedRule, ctx: AllocationContext): { shares: Map<string, Decimal> } | { problem: AllocationProblem } {
  if (rule.basis === "revenue") {
    const shares = proportional(ctx.revenue, ctx.entities);
    return shares ? { shares } : { problem: "no_revenue" };
  }
  if (rule.basis === "headcount") {
    const shares = proportional(new Map([...ctx.headcount].map(([e, n]) => [e, new Decimal(n)])), ctx.entities);
    return shares ? { shares } : { problem: "no_headcount" };
  }
  const problem = fixedProblem(rule.fixed ?? {}, ctx.entities);
  if (problem) return { problem };
  return { shares: proportional(readPercents(rule.fixed ?? {})!, ctx.entities)! };
}

/** Splits an amount by the shares to the sen; the leftover sen go to the largest share (the first, on a tie). */
export function splitAmount(amount: Money, shares: ReadonlyMap<string, Decimal>): Map<string, Money> {
  const out = new Map([...shares].map(([e, s]) => [e, amount.times(s).toDecimalPlaces(2, Decimal.ROUND_DOWN)]));
  const leftover = amount.minus(sum([...out.values()]));
  if (!leftover.isZero()) {
    const [largest] = [...shares].reduce((best, cur) => (cur[1].gt(best[1]) ? cur : best));
    out.set(largest, out.get(largest)!.plus(leftover));
  }
  return out;
}

export type AllocatedLine<L> = L | (L & { allocatedFrom: string });

/**
 * The lines as reports see them after allocation: each shared cost line becomes one share per entity,
 * month by month, so company totals never move. The lines themselves are never changed.
 */
export function allocateShared<L extends SummaryLine & { id: string }>(
  lines: readonly L[],
  rules: ReadonlyMap<string, SharedRule>,
  ctx: AllocationContext,
): { lines: (L & { allocatedFrom?: string })[]; problems: { id: string; problem: AllocationProblem }[] } {
  const out: (L & { allocatedFrom?: string })[] = [];
  const problems: { id: string; problem: AllocationProblem }[] = [];
  for (const l of lines) {
    const rule = rules.get(l.id);
    if (!rule || l.category === "Revenue") {
      out.push(l);
      continue;
    }
    const r = allocationShares(rule, ctx);
    if ("problem" in r) {
      problems.push({ id: l.id, problem: r.problem });
      out.push(l);
      continue;
    }
    const byMonth = l.months.map((m) => splitAmount(m, r.shares));
    for (const entity of r.shares.keys()) {
      out.push({ ...l, entity, months: byMonth.map((m) => m.get(entity)!), allocatedFrom: l.id });
    }
  }
  return { lines: out, problems };
}

export interface EntityAllocationRow {
  key: string;
  revenue: Money;
  costBefore: Money;
  /** Shared cost received, or given away (negative) by the entity that carries the lines. */
  allocated: Money;
  costAfter: Money;
  netAfter: Money;
}

/** The Per entitas view: each entity's own cost, the shared cost moved to or from it, and its net after allocation. */
export function entityAllocation(before: readonly Contribution[], after: readonly Contribution[], entities: readonly string[]): EntityAllocationRow[] {
  const keys = [...entities, ...[...before, ...after].map((c) => c.key).filter((k) => !entities.includes(k))];
  return [...new Set(keys)].flatMap((key) => {
    const b = before.find((c) => c.key === key);
    const a = after.find((c) => c.key === key);
    if (!a && !b) return [];
    const revenue = (a ?? b)!.revenue;
    const costBefore = b?.cost ?? ZERO;
    const costAfter = a?.cost ?? ZERO;
    return [{ key, revenue, costBefore, allocated: costAfter.minus(costBefore), costAfter, netAfter: revenue.minus(costAfter) }];
  });
}
