import { money, sum, ZERO, type Money } from "./money";
import type { OrgTree } from "./org";
import type { Actor } from "./policy";
import type { Role } from "./roles";

/** The division that keeps the Pipeline register (plan: Revenue and pipeline belong to BCD). */
export const PIPELINE_UNIT = "BCD";

/** Status codes from the Pipeline sheet, each with its probability band in percent. */
export const DEAL_STATUSES = ["PP", "PT", "QO", "WB"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];
const BAND: Record<DealStatus, [number, number]> = { PP: [0, 30], PT: [30, 60], QO: [60, 70], WB: [70, 90] };
export const statusBand = (s: DealStatus): [number, number] => BAND[s];

export const DEAL_TYPES = ["new", "renewal"] as const;
export type DealType = (typeof DEAL_TYPES)[number];
export const DEAL_TYPE_LABEL: Record<DealType, string> = { new: "New", renewal: "Renewal" };

export const SEGMENTS = ["Telco Business", "Government Business", "Enterprise Business", "Territory Business"] as const;

/** A deal as typed or imported; value excludes PPN, probability is a percent. Amounts as plain decimal strings. */
export interface DealInput {
  entity: string;
  customer: string;
  endCustomer?: string | null;
  segment: string;
  project: string;
  coaCode: string | null;
  value: string;
  status: DealStatus;
  probability: string;
  type: DealType;
  startMonth: number;
  endMonth: number;
  notes?: string | null;
}

/** Pipeline value counted towards revenue expectations: value × probability. Never added to RKA revenue. */
export function weighted(deal: Pick<DealInput, "value" | "probability">): Money {
  return money(deal.value).times(money(deal.probability)).div(100);
}

export interface DealProblem {
  field: "customer" | "project" | "segment" | "value" | "probability" | "months";
  code: "required" | "not_positive" | "out_of_range" | "outside_band" | "unknown" | "end_before_start";
  /** A warning the user may save past. */
  blocking: boolean;
}

const num = (s: string) => {
  try {
    return money(s);
  } catch {
    return null;
  }
};

export function dealProblems(d: DealInput): DealProblem[] {
  const out: DealProblem[] = [];
  if (!d.customer.trim()) out.push({ field: "customer", code: "required", blocking: true });
  if (!d.project.trim()) out.push({ field: "project", code: "required", blocking: true });
  if (!(SEGMENTS as readonly string[]).includes(d.segment)) out.push({ field: "segment", code: "unknown", blocking: true });
  const value = num(d.value);
  if (!value || value.lte(0)) out.push({ field: "value", code: "not_positive", blocking: true });
  const p = num(d.probability);
  if (!p || p.lt(0) || p.gt(100)) out.push({ field: "probability", code: "out_of_range", blocking: true });
  else {
    const [lo, hi] = BAND[d.status];
    if (p.lt(lo) || p.gt(hi)) out.push({ field: "probability", code: "outside_band", blocking: false });
  }
  const month = (m: number) => Number.isInteger(m) && m >= 1 && m <= 12;
  if (!month(d.startMonth) || !month(d.endMonth)) out.push({ field: "months", code: "out_of_range", blocking: true });
  else if (d.endMonth < d.startMonth) out.push({ field: "months", code: "end_before_start", blocking: true });
  return out;
}

export interface SegmentRow {
  segment: string;
  deals: number;
  value: Money;
  weighted: Money;
  target: Money | null;
}

/** Per segment: deals, value, weighted value and BCD's revenue target, in order of first appearance, then targets alone. */
export function pipelineBySegment(deals: readonly Pick<DealInput, "segment" | "value" | "probability">[], targets: ReadonlyMap<string, Money>): SegmentRow[] {
  const out = new Map<string, SegmentRow>();
  const row = (segment: string) => out.get(segment) ?? { segment, deals: 0, value: ZERO, weighted: ZERO, target: targets.get(segment) ?? null };
  for (const d of deals) {
    const r = row(d.segment);
    out.set(d.segment, { ...r, deals: r.deals + 1, value: r.value.plus(money(d.value)), weighted: r.weighted.plus(weighted(d)) });
  }
  for (const segment of targets.keys()) if (!out.has(segment)) out.set(segment, row(segment));
  return [...out.values()];
}

export const pipelineTotals = (deals: readonly Pick<DealInput, "value" | "probability">[]) => ({
  value: sum(deals.map((d) => money(d.value))),
  weighted: sum(deals.map(weighted)),
});

const EDITORS: readonly Role[] = ["requestor", "default_owner", "division_owner"];
const READERS: readonly Role[] = ["finance", "director", "auditor"];

/** BCD's people keep the register within their entities; Finance, Direktur and Auditor read it. No approval flow. */
export function canPipeline(actor: Actor, action: "view" | "edit", entity: string | null, org: OrgTree): boolean {
  const bcd = EDITORS.includes(actor.role) && org.isWithin(actor.orgUnit, PIPELINE_UNIT);
  if (action === "view") return bcd || READERS.includes(actor.role);
  return bcd && !!entity && (actor.entities.includes("*") || actor.entities.includes(entity));
}
