import type { Category } from "./budget";
import type { Money } from "./money";

export interface Variance {
  amount: Money;
  /** Percent change; null when there is no base to compare with. */
  pct: Money | null;
}

/** The 2027 plan against a 2026 figure (RKA or Actual), as the division sheets show beside each line. */
export function variance(plan: Money, base: Money | null): Variance {
  if (!base) return { amount: plan, pct: null };
  return { amount: plan.minus(base), pct: base.isZero() ? null : plan.minus(base).div(base).times(100) };
}

export type RemapProblem =
  | "source_not_provisional"
  | "target_missing"
  | "same_code"
  | "target_inactive"
  | "target_provisional"
  | "category_mismatch"
  | "locked_lines";

/**
 * Whether Finance may move every line off a provisional code onto an existing one. Only provisional codes are
 * remapped (a COA Master code keeps its history), the category must match so totals stay in their rows,
 * and lines in a locked version never change.
 */
export function remapProblem(
  source: { code: string; category: Category; provisional: boolean },
  target: { code: string; category: Category; active: boolean; provisional: boolean } | undefined,
  lockedLines: number,
): RemapProblem | null {
  if (!source.provisional) return "source_not_provisional";
  if (!target) return "target_missing";
  if (target.code === source.code) return "same_code";
  if (!target.active) return "target_inactive";
  if (target.provisional) return "target_provisional";
  if (target.category !== source.category) return "category_mismatch";
  if (lockedLines > 0) return "locked_lines";
  return null;
}

/** A COA code in the tree: Finance sets the parent, e.g. 5500 over 5510 and 5520. */
export interface CoaNode {
  code: string;
  category: Category;
  parentCode: string | null;
}

/** Codes a code's number points to, nearest first: 6211 → 6210, 6200, 6000; 6130-S2 → 6130, 6100, 6000. */
function parentCandidates(code: string): string[] {
  const dash = code.indexOf("-");
  if (dash > 0) {
    const base = code.slice(0, dash);
    return [base, ...parentCandidates(base)];
  }
  if (!/^\d+$/.test(code)) return [];
  const out: string[] = [];
  for (let k = 1; k < code.length; k++) {
    const c = code.slice(0, code.length - k) + "0".repeat(k);
    if (c !== code && !out.includes(c)) out.push(c);
  }
  return out;
}

/**
 * The parent the code numbers already imply, used to start the tree from the workbook's flat COA Master:
 * the nearest existing code in the same category, so a subtotal never mixes rows of the P&L.
 */
export function inferCoaParent(code: string, accounts: readonly Pick<CoaNode, "code" | "category">[]): string | null {
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const self = byCode.get(code);
  for (const c of parentCandidates(code)) {
    const p = byCode.get(c);
    if (p) return !self || p.category === self.category ? p.code : null;
  }
  return null;
}

export type CoaParentProblem = "self" | "missing" | "category_mismatch" | "cycle";

export function coaParentProblem(code: string, parentCode: string | null, accounts: readonly CoaNode[], category: Category): CoaParentProblem | null {
  if (!parentCode) return null;
  if (parentCode === code) return "self";
  const parent = accounts.find((a) => a.code === parentCode);
  if (!parent) return "missing";
  if (parent.category !== category) return "category_mismatch";
  if (coaSubtree(code, accounts).has(parentCode)) return "cycle";
  return null;
}

/** Parents before their children, each level in code order. A code whose parent is gone sits at the root. */
export function coaTree<T extends Pick<CoaNode, "code" | "parentCode">>(accounts: readonly T[]): { account: T; depth: number }[] {
  const codes = new Set(accounts.map((a) => a.code));
  const children = new Map<string | null, T[]>();
  for (const a of accounts) {
    const key = a.parentCode && codes.has(a.parentCode) ? a.parentCode : null;
    children.set(key, [...(children.get(key) ?? []), a]);
  }
  const out: { account: T; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (key: string | null, depth: number) => {
    for (const a of [...(children.get(key) ?? [])].sort((x, y) => x.code.localeCompare(y.code))) {
      if (seen.has(a.code)) continue;
      seen.add(a.code);
      out.push({ account: a, depth });
      walk(a.code, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** A code and every code under it. */
export function coaSubtree(code: string, accounts: readonly Pick<CoaNode, "code" | "parentCode">[]): Set<string> {
  const out = new Set([code]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const a of accounts) {
      if (a.parentCode && out.has(a.parentCode) && !out.has(a.code)) {
        out.add(a.code);
        grew = true;
      }
    }
  }
  return out;
}
