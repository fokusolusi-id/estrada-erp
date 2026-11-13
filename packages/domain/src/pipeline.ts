import { money, sum, ZERO, type Money } from "./money";
import type { OrgTree } from "./org";
import type { Actor } from "./policy";
import type { Role } from "./roles";

/** The division that keeps the Pipeline register (plan: Revenue and pipeline belong to BCD). */
export const PIPELINE_UNIT = "BCD";

/** Status codes from the Pipeline sheet, each with its probability band in percent. */
export const DEAL_STATUSES = ["PP", "PT", "QO", "WB", "CW"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];
/** CW (Closed Won) is not on the sheet: the contract is signed, so it counts in full and needs its Billing Termin. */
const BAND: Record<DealStatus, [number, number]> = { PP: [0, 30], PT: [30, 60], QO: [60, 70], WB: [70, 90], CW: [100, 100] };
export const statusBand = (s: DealStatus): [number, number] => BAND[s];
export const DEAL_STATUS_LABEL: Record<DealStatus, string> = { PP: "Potential", PT: "Potential", QO: "Quotation", WB: "Won Bidding", CW: "Closed Won" };
/** The "Won Bidding saja" basis of the segment report: won at bidding, signed or not. */
export const isWon = (s: DealStatus) => s === "WB" || s === "CW";

export const DEAL_TYPES = ["new", "renewal"] as const;
export type DealType = (typeof DEAL_TYPES)[number];
export const DEAL_TYPE_LABEL: Record<DealType, string> = { new: "New", renewal: "Renewal" };

export const SEGMENTS = ["Telco Business", "Government Business", "Enterprise Business", "Territory Business"] as const;

/** One planned invoice of a deal: an amount excluding PPN on a planned date (YYYY-MM-DD). */
export interface TerminInput {
  amount: string;
  plannedDate: string;
  description?: string | null;
}

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
  /** Months between the deal's start and PDMS's spend for it; feeds the PDMS spend estimate. */
  leadTimeMonths?: number | null;
  /** Billing Termin. Required, for 100% of the value, once the deal is Closed Won. */
  termins?: readonly TerminInput[];
}

/** Pipeline value counted towards revenue expectations: value × probability. Never added to RKA revenue. */
export function weighted(deal: Pick<DealInput, "value" | "probability">): Money {
  return money(deal.value).times(money(deal.probability)).div(100);
}

export interface DealProblem {
  field: "customer" | "project" | "segment" | "coa" | "value" | "probability" | "months" | "leadTime" | "termin";
  code: "required" | "not_positive" | "out_of_range" | "outside_band" | "unknown" | "end_before_start" | "termin_total" | "termin_over";
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
  if (!d.coaCode?.trim()) out.push({ field: "coa", code: "required", blocking: true });
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
  const lead = d.leadTimeMonths;
  if (lead != null && !(Number.isInteger(lead) && lead >= 0 && lead <= 24)) out.push({ field: "leadTime", code: "out_of_range", blocking: true });

  const termins = d.termins ?? [];
  if (termins.some((t) => !num(t.amount)?.gt(0) || !isDate(t.plannedDate))) out.push({ field: "termin", code: "out_of_range", blocking: true });
  else if (value) {
    const total = terminTotal(termins);
    if (total.gt(value)) out.push({ field: "termin", code: "termin_over", blocking: true });
    else if (d.status === "CW" && !total.eq(value)) out.push({ field: "termin", code: "termin_total", blocking: true });
  }
  return out;
}

const isDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
};

export const terminTotal = (termins: readonly Pick<TerminInput, "amount">[]): Money => sum(termins.map((t) => money(t.amount)));

const projectKey = (d: Pick<DealInput, "entity" | "project">) => `${d.entity}\u0000${d.project.trim().replace(/\s+/g, " ").toLowerCase()}`;

/** The project name becomes the Kode Proyek on Closed Won, so it is unique per fiscal year and entity. `others` excludes the deal itself. */
export const duplicateProject = (d: Pick<DealInput, "entity" | "project">, others: readonly Pick<DealInput, "entity" | "project">[]): boolean =>
  others.some((o) => projectKey(o) === projectKey(d));

/** Groups of deals of one year that share an entity and project name. */
export function duplicateProjects<T extends Pick<DealInput, "entity" | "project">>(deals: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const d of deals) groups.set(projectKey(d), [...(groups.get(projectKey(d)) ?? []), d]);
  return [...groups.values()].filter((g) => g.length > 1);
}

export interface SegmentRow {
  segment: string;
  deals: number;
  value: Money;
  weighted: Money;
  /** The second basis, "Won Bidding saja": deals won at bidding (WB or CW) and their full value. */
  wonDeals: number;
  wonValue: Money;
  target: Money | null;
  /** Weighted pipeline over target, as a multiple (1 = 1,0x); null without a target. */
  coverage: Money | null;
}

/**
 * Per segment, both bases side by side (the whole pipeline, and Won Bidding only), the weighted value, BCD's
 * revenue target and the coverage against it. In order of first appearance, then targets alone.
 */
export function pipelineBySegment(deals: readonly Pick<DealInput, "segment" | "value" | "probability" | "status">[], targets: ReadonlyMap<string, Money>): SegmentRow[] {
  const out = new Map<string, Omit<SegmentRow, "coverage">>();
  const row = (segment: string) => out.get(segment) ?? { segment, deals: 0, value: ZERO, weighted: ZERO, wonDeals: 0, wonValue: ZERO, target: targets.get(segment) ?? null };
  for (const d of deals) {
    const r = row(d.segment);
    const won = isWon(d.status);
    out.set(d.segment, {
      ...r,
      deals: r.deals + 1,
      value: r.value.plus(money(d.value)),
      weighted: r.weighted.plus(weighted(d)),
      wonDeals: r.wonDeals + (won ? 1 : 0),
      wonValue: won ? r.wonValue.plus(money(d.value)) : r.wonValue,
    });
  }
  for (const segment of targets.keys()) if (!out.has(segment)) out.set(segment, row(segment));
  return [...out.values()].map((r) => ({ ...r, coverage: r.target && !r.target.isZero() ? r.weighted.div(r.target) : null }));
}

/** A segment whose weighted coverage is below 1,0x is red and needs the Sales Head's written recovery plan. */
export const needsRecovery = (r: Pick<SegmentRow, "coverage">): boolean => !!r.coverage && r.coverage.lt(1);

export interface CoaRow {
  coaCode: string | null;
  deals: number;
  value: Money;
  weighted: Money;
}

/** Pendapatan per COA as the RKA takes it from the pipeline: codes in order, deals without a COA last. */
export function pipelineByCoa(deals: readonly Pick<DealInput, "coaCode" | "value" | "probability">[]): CoaRow[] {
  const out = new Map<string | null, CoaRow>();
  for (const d of deals) {
    const code = d.coaCode || null;
    const r = out.get(code) ?? { coaCode: code, deals: 0, value: ZERO, weighted: ZERO };
    out.set(code, { ...r, deals: r.deals + 1, value: r.value.plus(money(d.value)), weighted: r.weighted.plus(weighted(d)) });
  }
  return [...out.values()].sort((a, b) => (a.coaCode === null ? 1 : b.coaCode === null ? -1 : a.coaCode.localeCompare(b.coaCode)));
}

export interface BillingRow<T> {
  deal: T;
  contract: Money;
  /** Termin planned inside the fiscal year. */
  thisYear: Money;
  /** Contract value not invoiced in the fiscal year: it falls to the following years. */
  carried: Money;
}

/**
 * The invoice plan, derived only from Billing Termin: per month of the fiscal year, and per project the contract
 * value against what is invoiced this year. The monthly figures are the sum of the rows by construction.
 * Lists every Closed Won deal and every deal that already has termin.
 */
export function billingPlan<T extends Pick<DealInput, "value" | "status" | "termins">>(deals: readonly T[], fiscalYear: number): { months: Money[]; total: Money; rows: BillingRow<T>[] } {
  const months: Money[] = Array.from({ length: 12 }, () => ZERO);
  const rows: BillingRow<T>[] = [];
  for (const deal of deals) {
    const termins = deal.termins ?? [];
    if (deal.status !== "CW" && !termins.length) continue;
    let thisYear = ZERO;
    for (const t of termins) {
      if (Number(t.plannedDate.slice(0, 4)) !== fiscalYear) continue;
      const m = Number(t.plannedDate.slice(5, 7)) - 1;
      months[m] = months[m]!.plus(money(t.amount));
      thisYear = thisYear.plus(money(t.amount));
    }
    const contract = money(deal.value);
    rows.push({ deal, contract, thisYear, carried: contract.minus(thisYear) });
  }
  return { months, total: sum(months), rows };
}

export const pipelineTotals = (deals: readonly Pick<DealInput, "value" | "probability">[]) => ({
  value: sum(deals.map((d) => money(d.value))),
  weighted: sum(deals.map(weighted)),
});

const EDITORS: readonly Role[] = ["requestor", "default_owner", "division_owner"];
const READERS: readonly Role[] = ["finance", "director", "auditor"];

/** The recovery plan of a red segment is the Sales Head's: BCD's division owner. */
export const canRecoveryPlan = (actor: Actor, org: OrgTree): boolean => actor.role === "division_owner" && org.isWithin(actor.orgUnit, PIPELINE_UNIT);

/** BCD's people keep the register within their entities; Finance, Direktur and Auditor read it. No approval flow. */
export function canPipeline(actor: Actor, action: "view" | "edit", entity: string | null, org: OrgTree): boolean {
  const bcd = EDITORS.includes(actor.role) && org.isWithin(actor.orgUnit, PIPELINE_UNIT);
  if (action === "view") return bcd || READERS.includes(actor.role);
  return bcd && !!entity && (actor.entities.includes("*") || actor.entities.includes(entity));
}
