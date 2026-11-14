import { EOS_UNIT, OPERATOR_UNIT, RECEIVER_UNIT, type HandoverStatus } from "./handover";
import type { OrgTree } from "./org";
import { canPipeline } from "./pipeline";
import type { Actor } from "./policy";
import { isDeliveryHead, type ProjectStatus, type ProjectTeam } from "./project";
import type { Role } from "./roles";

/*
 * Masa garansi dan penutupan (Serah Terima section D). The workbook marks these rules as the module's own
 * proposal, pending the Head PDMS's approval: no job description covers them.
 */

const isDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
};
const dayNumber = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86_400_000;

/**
 * Days between the BAST and MSO's acceptance. Responsibility for the service moves on the day MSO accepts, not on
 * the BAST date, so this transition period stays PMO's. Null until both dates exist.
 */
export const transitionDays = (bastOn: string | null, msoAcceptedOn: string | null): number | null =>
  bastOn && msoAcceptedOn ? Math.max(0, dayNumber(msoAcceptedOn) - dayNumber(bastOn)) : null;

/** A project in Layanan enters Garansi once ISO has accepted the handover and the warranty end date is set. */
export const serviceStage = (p: { status: ProjectStatus; handoverStatus: HandoverStatus; warrantyEndsOn: string | null }): ProjectStatus =>
  p.status === "Layanan" && p.handoverStatus === "Diterima_ISO" && p.warrantyEndsOn ? "Garansi" : p.status;

export type WarrantyProblem = "date" | "before_bast" | "no_bast" | "closed";

/** The end of the last warranty: set once the BAST is approved, never before it, and not on a closed project. */
export function warrantyProblems(p: { status: ProjectStatus; bastOn: string | null }, endsOn: string): WarrantyProblem[] {
  if (p.status === "Closing" || p.status === "Drop") return ["closed"];
  if (!p.bastOn) return ["no_bast"];
  if (!isDate(endsOn)) return ["date"];
  return endsOn < p.bastOn ? ["before_bast"] : [];
}

/**
 * A fault reported during warranty. It is an inherited project defect (Delivery Control repairs it, at the project's
 * cost) only when the Head ISO and the Head PMO both say so; otherwise it is operational and ISO's.
 */
export const DEFECT_STATUSES = ["Diajukan", "Cacat_Bawaan", "Operasional", "Diperbaiki", "Ditutup"] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];
export const DEFECT_STATUS_LABEL: Record<DefectStatus, string> = {
  Diajukan: "Menunggu penetapan",
  Cacat_Bawaan: "Cacat bawaan proyek",
  Operasional: "Gangguan operasional",
  Diperbaiki: "Diperbaiki",
  Ditutup: "Ditutup",
};
/** Still in the way of closing the project. */
export const isOpenDefect = (s: DefectStatus): boolean => s === "Diajukan" || s === "Cacat_Bawaan" || s === "Diperbaiki";

export interface DefectState {
  status: DefectStatus;
  reportedBy: string;
  /** Who confirmed it as an inherited defect for ISO and for PMO, by user id. */
  confirmedIso: string | null;
  confirmedPmo: string | null;
}

export type DefectAction = "report" | "confirm_iso" | "confirm_pmo" | "reject" | "fix" | "close";
export type DefectProblem = "wrong_status" | "text" | "not_handed_over" | "WARRANTY_SELF_CLASSIFICATION";

const DEFECT_FROM: Record<Exclude<DefectAction, "report">, DefectStatus> = { confirm_iso: "Diajukan", confirm_pmo: "Diajukan", reject: "Diajukan", fix: "Cacat_Bawaan", close: "Diperbaiki" };

/**
 * `defect` is null for a new report. `input.text` is the description, the reason for rejecting, or the corrective
 * work done. `next` is the defect's status when there are no problems.
 */
export function defectProblems(
  action: DefectAction,
  defect: DefectState | null,
  actorId: string,
  input: { text?: string; msoAcceptedOn?: string | null } = {},
): { problems: DefectProblem[]; next: DefectStatus } {
  if (action === "report") {
    if (!input.msoAcceptedOn) return { problems: ["not_handed_over"], next: "Diajukan" };
    return { problems: input.text?.trim() ? [] : ["text"], next: "Diajukan" };
  }
  const from = DEFECT_FROM[action];
  if (!defect || defect.status !== from) return { problems: ["wrong_status"], next: defect?.status ?? "Diajukan" };
  switch (action) {
    case "confirm_iso":
    case "confirm_pmo": {
      const other = action === "confirm_iso" ? defect.confirmedPmo : defect.confirmedIso;
      // Whoever reported it, or already confirmed the other side, does not settle who pays on their own.
      if (actorId === defect.reportedBy || actorId === other) return { problems: ["WARRANTY_SELF_CLASSIFICATION"], next: defect.status };
      return { problems: [], next: other ? "Cacat_Bawaan" : "Diajukan" };
    }
    case "reject":
      // Inherited or not: the reporter does not settle it alone in either direction.
      if (actorId === defect.reportedBy) return { problems: ["WARRANTY_SELF_CLASSIFICATION"], next: defect.status };
      return { problems: input.text?.trim() ? [] : ["text"], next: "Operasional" };
    case "fix":
      return { problems: input.text?.trim() ? [] : ["text"], next: "Diperbaiki" };
    case "close":
      return { problems: [], next: "Ditutup" };
  }
}

export type ClosureProblem = "closed" | "not_accepted" | "iso" | "warranty_unset" | "warranty_running" | "defects_open";

/**
 * A project is closed only after MSO and ISO have accepted it, the last warranty has ended and no inherited defect
 * is open. An open defect past the end date keeps the warranty running until it is closed.
 */
export function closureProblems(
  p: { status: ProjectStatus; msoAcceptedOn: string | null; handoverStatus: HandoverStatus; warrantyEndsOn: string | null; defects: readonly { status: DefectStatus }[] },
  today: string,
): ClosureProblem[] {
  if (p.status === "Closing" || p.status === "Drop") return ["closed"];
  const out: ClosureProblem[] = [];
  if (!p.msoAcceptedOn) out.push("not_accepted");
  else if (p.handoverStatus !== "Diterima_ISO") out.push("iso");
  if (!p.warrantyEndsOn) out.push("warranty_unset");
  else if (today < p.warrantyEndsOn) out.push("warranty_running");
  if (p.defects.some((d) => isOpenDefect(d.status))) out.push("defects_open");
  return out;
}

export type WarrantyAction = "warranty.set" | "defect.report" | "defect.confirm_iso" | "defect.confirm_pmo" | "defect.reject" | "defect.fix" | "defect.close" | "close";

const HEADS: readonly Role[] = ["default_owner", "division_owner"];
const isOperatorHead = (actor: Actor) => HEADS.includes(actor.role) && actor.orgUnit === OPERATOR_UNIT;

/**
 * BCD sets the warranty end date; ISO and MSO report a suspected inherited defect; the Head ISO and the Head PMO
 * classify it together; Delivery Control repairs it and the Head PMO closes it, and declares the project closed.
 */
export function canWarranty(actor: Actor, action: WarrantyAction, project: { entity: string; team: ProjectTeam }, org: OrgTree): boolean {
  if (!(actor.entities.includes("*") || actor.entities.includes(project.entity))) return false;
  switch (action) {
    case "warranty.set":
      return canPipeline(actor, "edit", project.entity, org);
    case "defect.report":
      return org.isWithin(actor.orgUnit, OPERATOR_UNIT) || org.isWithin(actor.orgUnit, RECEIVER_UNIT) || org.isWithin(actor.orgUnit, EOS_UNIT);
    case "defect.confirm_iso":
      return isOperatorHead(actor);
    case "defect.confirm_pmo":
    case "defect.close":
    case "close":
      return isDeliveryHead(actor, org);
    case "defect.reject":
      return isOperatorHead(actor) || isDeliveryHead(actor, org);
    case "defect.fix":
      return project.team.deliveryControl === actor.userId;
  }
}
