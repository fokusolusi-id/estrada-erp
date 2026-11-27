/** The risk register: likelihood × impact, actions, review and evidence-based closure (plan D6; P3-M3, EXEC_20). */
import { ewRule } from "./early-warning";
import { isCfo } from "./home";
import type { OrgTree } from "./org";
import type { Actor } from "./policy";

export const RISK_CATEGORIES = ["financial", "operational", "strategic", "compliance", "technology", "reputation"] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];
export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = { financial: "Financial", operational: "Operational", strategic: "Strategic", compliance: "Compliance", technology: "Technology", reputation: "Reputation" };

export const RISK_STATUSES = ["identified", "in_progress", "mitigated", "closed", "accepted"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];
export const RISK_STATUS_LABEL: Record<RiskStatus, string> = { identified: "Teridentifikasi", in_progress: "Ditangani", mitigated: "Termitigasi", closed: "Ditutup", accepted: "Diterima" };
export const isLiveRisk = (s: RiskStatus) => s !== "closed" && s !== "accepted";

export type RiskSeverity = "critical" | "high" | "medium" | "low";
export const riskScore = (likelihood: number, impact: number) => likelihood * impact;
/** Bands of sheet P3_Module_Spec (client chose them over EXEC_20's). */
export const severityOf = (score: number): RiskSeverity => (score >= 20 ? "critical" : score >= 15 ? "high" : score >= 8 ? "medium" : "low");

export function riskProblem(v: { title: string; likelihood: number; impact: number; ownerUserId: string; actionPlan: string; dueOn: string | null }) {
  const scale = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;
  if (!v.title.trim()) return "title" as const;
  if (!scale(v.likelihood) || !scale(v.impact)) return "scale" as const;
  if (!v.ownerUserId) return "owner" as const;
  const severity = severityOf(riskScore(v.likelihood, v.impact));
  return (severity === "critical" || severity === "high") && (!v.actionPlan.trim() || !v.dueOn) ? ("plan" as const) : null;
}

export interface RiskSubject {
  /** null for a risk of the whole group. */
  entity: string | null;
  ownerUserId: string;
  likelihood: number;
  impact: number;
}

const covers = (actor: Actor, entity: string | null) => actor.entities.includes("*") || (!!entity && actor.entities.includes(entity));
export const canEditRisk = (actor: Actor, r: Pick<RiskSubject, "entity">, org: OrgTree) => (actor.role === "finance" || actor.role === "director" || isCfo(actor, org)) && covers(actor, r.entity);
export const canWorkRisk = (actor: Actor, r: Pick<RiskSubject, "entity" | "ownerUserId">, org: OrgTree) => actor.userId === r.ownerUserId || canEditRisk(actor, r, org);
export const canViewRisk = (actor: Actor, r: Pick<RiskSubject, "entity" | "ownerUserId">, org: OrgTree) => canWorkRisk(actor, r, org) || (actor.role === "auditor" && covers(actor, r.entity));

/** Closing and accepting are decided above the owner; accepting a Critical risk is the BOD's. */
export function canDecideRisk(actor: Actor, r: RiskSubject, to: "closed" | "accepted", org: OrgTree): boolean {
  if (actor.userId === r.ownerUserId || !covers(actor, r.entity)) return false;
  if (to === "accepted" && severityOf(riskScore(r.likelihood, r.impact)) === "critical") return actor.role === "director" && actor.entities.includes("*");
  return actor.role === "director" || isCfo(actor, org);
}

export function statusProblem(from: RiskStatus, to: RiskStatus, v: { note: string; evidence: boolean }) {
  if (!isLiveRisk(from) || from === to) return "closed" as const;
  if (to === "closed" && !v.evidence) return "evidence" as const;
  return (to === "closed" || to === "accepted") && !v.note.trim() ? ("note" as const) : null;
}

/** A month on, at the end of that month when it is shorter. */
export function nextReview(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}

export function heatmap(risks: readonly { likelihood: number; impact: number; status: RiskStatus }[]) {
  return (likelihood: number, impact: number) => risks.filter((r) => isLiveRisk(r.status) && r.likelihood === likelihood && r.impact === impact).length;
}

const WARNING_CATEGORY: Record<string, RiskCategory> = { "EW-01": "financial", "EW-02": "financial", "EW-12": "financial" };

/** The Critical risk a Critical early warning opens (P3-M3 rule 3); null for other rules or without an owner. */
export function riskFromWarning(w: { code: string; subject: string; assignees: readonly string[]; today: string }) {
  const rule = ewRule(w.code);
  const owner = w.assignees[0];
  if (rule?.severity !== "critical" || !owner) return null;
  return {
    category: WARNING_CATEGORY[w.code] ?? ("financial" as RiskCategory),
    title: rule.name,
    likelihood: 4,
    impact: 5,
    ownerUserId: owner,
    actionPlan: rule.action,
    dueOn: new Date(Date.parse(`${w.today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10),
    ewRule: w.code,
  };
}
