/** A project's contract record and its opening at Won Bidding (plan C2; sheet FC04_Projek; BR-PRJ-001..004, BR-SP-004). */
import type { OrgTree } from "./org";
import { isWon, type DealStatus } from "./pipeline";
import type { Actor } from "./policy";
import { canProject, type ProjectStatus, type ProjectTeam } from "./project";

export const PAYMENT_TERMS = ["lumpsum", "turnkey", "termin"] as const;
export type PaymentTerm = (typeof PAYMENT_TERMS)[number];
export const PAYMENT_TERM_LABEL: Record<PaymentTerm, string> = { lumpsum: "Lumpsum", turnkey: "Turnkey", termin: "Termin" };

export const PIC_ROLES = ["legal", "scm", "pm", "ops", "hrd", "finance"] as const;
export type PicRole = (typeof PIC_ROLES)[number];
export const PIC_LABEL: Record<PicRole, string> = { legal: "PIC Legal", scm: "PIC SCM", pm: "PIC PM", ops: "PIC OPS", hrd: "PIC HRD", finance: "PIC Finance" };

export type ContractProblem = "number" | "date" | "p8" | "order" | "duration" | "term";
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The contract is recorded whole: dated no earlier than the P8/SPPBJ was received, and not in the future. */
export function contractProblem(v: { number: string; date: string; p8On: string | null; duration: string; term: PaymentTerm | null; today: string }): ContractProblem | null {
  if (!v.number.trim()) return "number";
  if (!isDate(v.date) || v.date > v.today) return "date";
  if (!v.p8On) return "p8";
  if (v.date < v.p8On) return "order";
  if (!v.duration.trim()) return "duration";
  return v.term ? null : "term";
}

export type ContractSection = "p8" | "contract" | "pic";
const LEGAL_UNIT = "FRM-LCM";

/** Sales receives the P8, Legal records the contract, the Head PMO names the PICs. */
export function canContract(actor: Actor, section: ContractSection, project: { entity: string; team: ProjectTeam | null; status?: ProjectStatus }, org: OrgTree): boolean {
  if (section === "p8") return canProject(actor, "contract.change", project, org);
  if (section === "pic") return canProject(actor, "assign", project, org);
  const staff = actor.role === "requestor" || actor.role === "default_owner" || actor.role === "division_owner";
  const open = project.status !== "Drop" && project.status !== "Closing";
  return open && staff && org.isWithin(actor.orgUnit, LEGAL_UNIT) && (actor.entities.includes("*") || actor.entities.includes(project.entity));
}

/** A deal becoming won opens its project, with the contract's number of sites. */
export function autoProject(v: { from: DealStatus | null; to: DealStatus; hasProject: boolean; sites: number | null }): { open: false } | { open: true; sites: number } | { problem: "sites" } {
  if (v.hasProject || !isWon(v.to) || (v.from && isWon(v.from))) return { open: false };
  return v.sites ? { open: true, sites: v.sites } : { problem: "sites" };
}
