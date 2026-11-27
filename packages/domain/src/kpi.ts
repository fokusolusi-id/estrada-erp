/** Yearly KPI targets per company (plan D1; sheet FC01_Set_KPI; BR-KPI-001..003, BR-TGT-001..002). */
import { sum, ZERO, type Money } from "./money";
import type { Actor } from "./policy";
import { splitBySeason } from "./scenario";

export interface KpiTargets {
  /** Won bidding for the year. */
  revenue: Money;
  /** The part billed straight to ministries; the rest is indirect, via Telkom. */
  revenueDirect: Money;
  ebitdaPct: Money;
  cashIn: Money;
  netMarginPct: Money;
}

export const KPI_STATES = ["draft", "submitted", "returned", "approved"] as const;
export type KpiState = (typeof KPI_STATES)[number];
export const KPI_STATE_LABEL: Record<KpiState, string> = { draft: "Draft", submitted: "Diajukan ke BOD", returned: "Dikembalikan", approved: "Aktif" };
export const KPI_ACTIONS = ["submit", "approve", "return"] as const;
export type KpiAction = (typeof KPI_ACTIONS)[number];
export const KPI_ACTION_LABEL: Record<KpiAction, string> = { submit: "Ajukan ke BOD", approve: "Setujui", return: "Kembalikan" };

export function kpiProblem(t: KpiTargets): "revenue" | "cash_in" | "percent" | "direct" | null {
  if (!t.revenue.gt(0)) return "revenue";
  if (!t.cashIn.gt(0)) return "cash_in";
  if ([t.ebitdaPct, t.netMarginPct].some((p) => p.isNegative() || p.gt(100))) return "percent";
  return t.revenueDirect.isNegative() || t.revenueDirect.gt(t.revenue) ? "direct" : null;
}

/** A Direktur whose seat covers all companies is the BOD; one limited to companies is their Direktur PT. */
const isBod = (a: Actor) => a.role === "director" && a.entities.includes("*");
export const canEditKpi = (a: Actor, entity: string) => a.role === "director" && !a.entities.includes("*") && a.entities.includes(entity);

export interface KpiLike {
  state: KpiState;
  entity: string;
  submittedBy: string | null;
  /** The board decision (sheet FC01_Set_KPI). */
  hasDocument: boolean;
}

export function kpiStep(k: KpiLike, action: KpiAction, actor: Actor, note: string): { to: KpiState } | { problem: "not_allowed" | "note_required" | "document_required" } {
  const approver = k.state === "submitted" && isBod(actor) && actor.userId !== k.submittedBy;
  if (action === "submit") return (k.state === "draft" || k.state === "returned") && canEditKpi(actor, k.entity) ? { to: "submitted" } : { problem: "not_allowed" };
  if (!approver) return { problem: "not_allowed" };
  if (action === "approve") return k.hasDocument ? { to: "approved" } : { problem: "document_required" };
  return note.trim() ? { to: "returned" } : { problem: "note_required" };
}

export const kpiActions = (k: KpiLike, actor: Actor): KpiAction[] => KPI_ACTIONS.filter((a) => "to" in kpiStep(k, a, actor, "x"));

/** The share of a year's amount that falls in the months up to `month`. */
export const phasedTarget = (amount: Money, seasonality: readonly string[], month: number): Money => sum(splitBySeason(amount, seasonality).slice(0, month));

export function consolidateTargets(list: readonly KpiTargets[]): KpiTargets {
  const total = (pick: (t: KpiTargets) => Money) => sum(list.map(pick));
  const revenue = total((t) => t.revenue);
  const weighted = (pick: (t: KpiTargets) => Money) => (revenue.gt(0) ? total((t) => t.revenue.times(pick(t))).div(revenue) : ZERO);
  return { revenue, revenueDirect: total((t) => t.revenueDirect), cashIn: total((t) => t.cashIn), ebitdaPct: weighted((t) => t.ebitdaPct), netMarginPct: weighted((t) => t.netMarginPct) };
}

export const achievement = (actual: Money, target: Money): Money | null => (target.isZero() ? null : actual.times(100).div(target).toDecimalPlaces(1));
