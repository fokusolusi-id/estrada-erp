/** Telkom billing from tender to cash in (plan C4; sheets 12_Stages_Penagihan, 15_Escalation_Matrix; BR-PNG-001..006). */
import type { OrgTree } from "./org";
import type { Actor } from "./policy";
import type { Role } from "./roles";

/** Who at Estrada works a stage. */
export type StageActor = "sales" | "legal" | "delivery" | "ar" | "cash";
export const STAGE_ACTOR_LABEL: Record<StageActor, string> = { sales: "Sales", legal: "Legal", delivery: "PM / OPS", ar: "Finance AR", cash: "Cash Management" };

export interface TelkomStage {
  no: number;
  name: string;
  telkom: string;
  actor: StageActor;
  /** Calendar days; null where the sheet gives none, so it never breaches. */
  slaDays: number | null;
  level: 0 | 1 | 2 | 3 | 4;
  /** May be marked not applicable (client decision). */
  optional?: boolean;
}

export const TELKOM_STAGES: readonly TelkomStage[] = [
  { no: 1, name: "Lelang / BAKN (P6)", telkom: "OBL / Govsol", actor: "sales", slaDays: 5, level: 0 },
  { no: 2, name: "P8 / SPPBJ / WO / PO", telkom: "OBL", actor: "sales", slaDays: 5, level: 0 },
  { no: 3, name: "Kontrak Layanan (KL)", telkom: "OBL Manager + Legal", actor: "legal", slaDays: 10, level: 0 },
  { no: 4, name: "BAI", telkom: "GSPO", actor: "delivery", slaDays: null, level: 1 },
  { no: 5, name: "BAUT / BARD", telkom: "GSPO", actor: "delivery", slaDays: 7, level: 1 },
  { no: 6, name: "BAST", telkom: "GSPO", actor: "delivery", slaDays: 3, level: 1 },
  { no: 7, name: "Close WFM PSB (AO/SID baru)", telkom: "GSPO", actor: "delivery", slaDays: 2, level: 1, optional: true },
  { no: 8, name: "Close WFM Existing", telkom: "Segmen", actor: "delivery", slaDays: 7, level: 2, optional: true },
  { no: 9, name: "BAK / BAPL", telkom: "ASC + PRM", actor: "delivery", slaDays: 2, level: 2 },
  { no: 10, name: "BA Kesepakatan / BAKD / BAKH", telkom: "ASC + GSPO", actor: "delivery", slaDays: null, level: 2, optional: true },
  { no: 11, name: "OGP / Precise / Invsoft / Journal / SPB", telkom: "OGP / PIA / Finance", actor: "ar", slaDays: null, level: 3 },
  { no: 12, name: "Cash In", telkom: "Treasury Telkom", actor: "cash", slaDays: null, level: 4 },
];

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The first stage not done, when it started (the previous one's date) and when it is due. */
export function stagePosition(startedOn: string, done: readonly { stage: number; doneOn: string }[]) {
  const current = TELKOM_STAGES.find((s) => !done.some((d) => d.stage === s.no)) ?? null;
  const since = done.reduce((latest, d) => (d.doneOn > latest ? d.doneOn : latest), startedOn);
  return { current: current?.no ?? null, since, deadline: current?.slaDays ? addDays(since, current.slaDays) : null };
}

export type StageProblem = "order" | "required" | "reason" | "date" | "document";

export function stageProblem(v: { stage: number; current: number | null; since: string; doneOn: string; today: string; notApplicable: boolean; reason: string; hasDocument: boolean }): StageProblem | null {
  if (v.stage !== v.current) return "order";
  if (v.notApplicable && !TELKOM_STAGES[v.stage - 1]?.optional) return "required";
  if (v.notApplicable && v.reason.trim().length < 3) return "reason";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.doneOn) || v.doneOn < v.since || v.doneOn > v.today) return "date";
  return !v.notApplicable && !v.hasDocument ? "document" : null;
}

/** 0 until the deadline passes, then one tier higher after each further SLA period, up to 5. */
export function dueTier(deadline: string | null, slaDays: number | null, today: string): number {
  if (!deadline || !slaDays || today <= deadline) return 0;
  const late = Math.round((Date.parse(today) - Date.parse(deadline)) / 86_400_000);
  return Math.min(5, 1 + Math.floor((late - 1) / slaDays));
}

const UNITS: Record<Exclude<StageActor, "cash">, readonly string[]> = { sales: ["BCD"], legal: ["FRM-LCM"], delivery: ["PMO", "MSO", "ISO"], ar: ["FRM-FIN-ATM"] };
const STAFF: readonly Role[] = ["requestor", "default_owner", "division_owner"];

export function canCompleteStage(actor: Actor, stage: number, entity: string, org: OrgTree): boolean {
  const s = TELKOM_STAGES[stage - 1];
  if (!s || !(actor.entities.includes("*") || actor.entities.includes(entity))) return false;
  if (s.actor === "cash") return actor.role === "cash_manager";
  return STAFF.includes(actor.role) && UNITS[s.actor].some((u) => org.isWithin(actor.orgUnit, u));
}

export function canViewTracker(actor: Actor, org: OrgTree): boolean {
  if (["finance", "director", "auditor", "cash_manager"].includes(actor.role)) return true;
  const inside = ["BCD", "PDMS", "FRM-LCM", "FRM-FIN-ATM"].some((u) => org.isWithin(actor.orgUnit, u));
  return STAFF.includes(actor.role) && (inside || (actor.role === "division_owner" && actor.orgUnit === "FRM"));
}

/** Tiers 1–3 the stage's own people, 4 their head, 5 the Direktur (client decision). */
export function escalationRecipients(stage: number, tier: number, entity: string, seats: readonly { orgUnit: string; role: Role; occupant: string | null; entities: readonly string[] }[], org: OrgTree): string[] {
  const s = TELKOM_STAGES[stage - 1]!;
  const head = (role: Role) => role === "default_owner" || role === "division_owner";
  const picked = seats.filter((seat) => {
    if (!seat.occupant || !(seat.entities.includes("*") || seat.entities.includes(entity))) return false;
    if (tier >= 5) return seat.role === "director";
    if (s.actor === "cash") return tier >= 4 ? seat.role === "division_owner" && seat.orgUnit === "FRM" : seat.role === "cash_manager";
    const mine = UNITS[s.actor].some((u) => org.isWithin(seat.orgUnit, u));
    return mine && (tier >= 4 ? head(seat.role) : STAFF.includes(seat.role));
  });
  return [...new Set(picked.map((p) => p.occupant!))].sort();
}

export const ASSURANCE_AREAS = ["obl_govsol", "obl_pss", "legal", "gspo", "asc", "pia", "finance"] as const;
export type AssuranceArea = (typeof ASSURANCE_AREAS)[number];
export const ASSURANCE_LABEL: Record<AssuranceArea, string> = { obl_govsol: "OBL Govsol", obl_pss: "OBL PSS", legal: "Legal", gspo: "GSPO", asc: "ASC", pia: "PIA", finance: "Finance" };

/** Done against total per JPMB area, over the projects that have it. */
export const assuranceSummary = (rows: readonly { area: AssuranceArea; done: boolean }[]) =>
  ASSURANCE_AREAS.map((area) => {
    const here = rows.filter((r) => r.area === area);
    const done = here.filter((r) => r.done).length;
    return { area, total: here.length, done, inProgress: here.length - done, percent: here.length ? Math.round((done * 100) / here.length) : null };
  });
