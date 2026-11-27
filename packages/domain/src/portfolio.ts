/** Portfolio per project and who sees the BOD screens (plan D3; FC10, FC11, BR-PRT-001..002, 18_Dashboard_Spec_BOD). */
import { isCfo } from "./home";
import { ZERO, type Money } from "./money";
import type { OrgTree } from "./org";
import type { Actor } from "./policy";
import type { ProjectStatus } from "./project";

export type Lifecycle = "won" | "active" | "closed" | "drop";
export const LIFECYCLE_LABEL: Record<Lifecycle, string> = { won: "Won", active: "Active", closed: "Closed", drop: "Drop" };
export const lifecycle = (status: ProjectStatus): Lifecycle => (status === "Initiation" ? "won" : status === "Closing" ? "closed" : status === "Drop" ? "drop" : "active");

export type DeliveryHealth = "on_track" | "at_risk" | "delayed";
export const DELIVERY_HEALTH_LABEL: Record<DeliveryHealth, string> = { on_track: "On-track", at_risk: "At-risk", delayed: "Delayed" };
/** How close an unmet RFS target counts as at risk. */
export const RFS_WARNING_DAYS = 14;

export function deliveryHealth(
  p: { status: ProjectStatus; rfsOn: string | null; rfsTargetOn: string | null; sites: readonly { status: string; plannedDoneOn: string | null; actualDoneOn: string | null }[] },
  today: string,
): DeliveryHealth | null {
  const stage = lifecycle(p.status);
  if (stage === "closed" || stage === "drop") return null;
  const target = p.rfsOn ? null : p.rfsTargetOn;
  const open = p.sites.filter((s) => !s.actualDoneOn);
  if ((target && target < today) || open.some((s) => s.plannedDoneOn && s.plannedDoneOn < today)) return "delayed";
  const soon = target && Date.parse(target) - Date.parse(today) <= RFS_WARNING_DAYS * 86_400_000;
  return soon || open.some((s) => s.status === "Terkendala") ? "at_risk" : "on_track";
}

export function portfolioFigures(revenue: Money, cogs: Money) {
  const grossProfit = revenue.minus(cogs);
  return { grossProfit, gpPct: revenue.gt(ZERO) ? grossProfit.times(100).div(revenue).toDecimalPlaces(1) : null };
}

/** The BOD is the Direktur (Komisaris shares the view); the Auditor reads; the Head of FRM sits as CFO. */
export const canViewDashboard = (actor: Actor, org: OrgTree) => actor.role === "director" || actor.role === "auditor" || isCfo(actor, org);
export const canViewPortfolio = (actor: Actor, org: OrgTree) => actor.role === "finance" || canViewDashboard(actor, org);
/** Monthly highlights speak for every company shown, so the writer must cover all of them. */
export const canEditHighlight = (actor: Actor, entities: readonly string[], org: OrgTree) =>
  (actor.role === "director" || isCfo(actor, org)) && (actor.entities.includes("*") || entities.every((e) => actor.entities.includes(e)));
