import type { OrgTree } from "./org";
import type { Actor } from "./policy";
import { isDeliveryHead, type ProjectStatus, type ProjectTeam, type SiteStatus } from "./project";

/** Records of Initiation and Planning (Tahap Implementasi B rows 1-2, 6-7, 9). Each holds where the document is kept. */
export const PLANNING_ITEMS = [
  { key: "kickoff", name: "Notulen dan daftar hadir kick-off", owner: "pm", stage: "Initiation" },
  { key: "mom", name: "MoM kick-off internal dan eksternal", owner: "project_admin", stage: "Initiation" },
  { key: "charter", name: "Project Charter, timeline dan anggaran", owner: "pm", stage: "Planning" },
  { key: "risk", name: "Risk Register dan strategi mitigasi", owner: "pm", stage: "Planning" },
  { key: "requirements", name: "Berkas kebutuhan administrasi implementasi", owner: "project_admin", stage: "Planning" },
] as const;
export type PlanningKey = (typeof PLANNING_ITEMS)[number]["key"];

const isDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
};

/** Kick-Off Gate: the contract is validated once the kick-off and its MoM are on record. */
export function kickoffGateProblems(p: { filled: readonly string[] }): ("kickoff" | "mom")[] {
  return (["kickoff", "mom"] as const).filter((k) => !p.filled.includes(k));
}

export type BaselineProblem = "kickoff_gate" | "charter" | "risk" | "team" | "rfs_target";

/** Baseline: the plan the Head PMO approves, with the target RFS date. After it, a change is a change order. */
export function baselineProblems(p: { kickoffGateOn: string | null; filled: readonly string[]; team: ProjectTeam; rfsTargetOn: string }): BaselineProblem[] {
  const out: BaselineProblem[] = [];
  if (!p.kickoffGateOn) out.push("kickoff_gate");
  if (!p.filled.includes("charter")) out.push("charter");
  if (!p.filled.includes("risk")) out.push("risk");
  if (!p.team.pm || !p.team.deliveryControl || !p.team.projectAdmin) out.push("team");
  if (!isDate(p.rfsTargetOn)) out.push("rfs_target");
  return out;
}

const FIELDWORK: readonly SiteStatus[] = ["Staging", "Dikirim", "Instalasi", "Uji"];

/** A site may be surveyed before the baseline; staging, delivery, installation and testing start after it. */
export const executionProblems = (baselineOn: string | null, status: SiteStatus): "baseline"[] => (!baselineOn && FIELDWORK.includes(status) ? ["baseline"] : []);

export type PlanningAction = "record" | "approve_gate" | "approve_baseline";

/**
 * The Project Manager records the kick-off, charter and risk register; the Project Admin the MoM and requirements;
 * the Head PMO approves the gate and the baseline, and not when they are part of the team that made them.
 */
export function canPlanning(
  actor: Actor,
  action: PlanningAction,
  key: PlanningKey | null,
  project: { entity: string; team: ProjectTeam; status?: ProjectStatus },
  org: OrgTree,
): boolean {
  if (!(actor.entities.includes("*") || actor.entities.includes(project.entity))) return false;
  if (project.status === "Drop" || project.status === "Closing") return false;
  if (action === "record") {
    const owner = PLANNING_ITEMS.find((i) => i.key === key)?.owner;
    return owner === "pm" ? project.team.pm === actor.userId : owner === "project_admin" ? project.team.projectAdmin === actor.userId : false;
  }
  return isDeliveryHead(actor, org) && ![project.team.pm, project.team.deliveryControl, project.team.projectAdmin].includes(actor.userId);
}

export interface CurvePoint {
  /** YYYY-MM */
  month: string;
  /** Percent of the contract's sites planned to be finished by the end of the month. */
  planned: number;
  /** Percent actually finished by the end of the month; null for months after the current one. */
  actual: number | null;
}

const monthOf = (d: string) => d.slice(0, 7);
const nextMonth = (m: string) => {
  const y = +m.slice(0, 4);
  const mo = +m.slice(5, 7);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};

/**
 * Kurva S: cumulative planned and actual finishes month by month, as a percent of the contract's sites (not of the
 * sites registered). Months run from the first to the last planned or actual date.
 */
export function kurvaS(sites: readonly { tglPlanSelesai: string; tglAktualSelesai?: string | null }[], contractSites: number, today: string): CurvePoint[] {
  const dates = sites.flatMap((s) => [s.tglPlanSelesai, s.tglAktualSelesai].filter((d): d is string => !!d && isDate(d))).map(monthOf);
  if (!dates.length || contractSites <= 0) return [];
  const first = dates.reduce((a, b) => (a < b ? a : b));
  const last = dates.reduce((a, b) => (a > b ? a : b));
  const now = monthOf(today);
  const pct = (n: number) => Math.round((n / contractSites) * 1000) / 10;
  const out: CurvePoint[] = [];
  for (let m = first; m <= last; m = nextMonth(m)) {
    const planned = sites.filter((s) => monthOf(s.tglPlanSelesai) <= m).length;
    const actual = sites.filter((s) => s.tglAktualSelesai && monthOf(s.tglAktualSelesai) <= m).length;
    out.push({ month: m, planned: pct(planned), actual: m <= now ? pct(actual) : null });
  }
  return out;
}
