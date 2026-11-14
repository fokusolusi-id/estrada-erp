import { EOS_UNIT, OPERATOR_UNIT, RECEIVER_UNIT } from "./handover";
import type { OrgTree } from "./org";
import type { PaymentSeat } from "./payment";
import { PIPELINE_UNIT } from "./pipeline";
import { DELIVERY_UNIT, type ProjectTeam } from "./project";
import type { Role } from "./roles";

export type ProjectTemplate =
  | "project_team"
  | "project_rfs_approval"
  | "project_bast_approval"
  | "project_bast_approved"
  | "project_handover_submitted"
  | "project_handover_returned"
  | "project_handover_accepted"
  | "project_defect_reported"
  | "project_defect_inherited";

/** The handoffs of a project that wake someone up. Per-site BAI steps are not among them: one email per handoff. */
export type ProjectEvent = "team_assigned" | "rfs_declared" | "bast_prepared" | "bast_approved" | "handover_submitted" | "handover_returned" | "handover_accepted" | "defect_reported" | "defect_inherited";

export type ProjectRecipient = "pm" | "delivery_control" | "project_admin" | "head_pmo" | "head_mso" | "head_iso" | "eos" | "assurance";

export interface ProjectNotice {
  template: ProjectTemplate;
  to: ProjectRecipient;
}

const n = (template: ProjectTemplate, ...to: ProjectRecipient[]): ProjectNotice[] => to.map((r) => ({ template, to: r }));

/** One email per handoff, never one per site, and no rupiah in the body. */
export const PROJECT_NOTICES: Record<ProjectEvent, ProjectNotice[]> = {
  team_assigned: n("project_team", "pm", "delivery_control", "project_admin"),
  rfs_declared: n("project_rfs_approval", "head_pmo"),
  bast_prepared: n("project_bast_approval", "head_pmo"),
  bast_approved: n("project_bast_approved", "assurance", "pm"),
  handover_submitted: n("project_handover_submitted", "head_mso"),
  handover_returned: n("project_handover_returned", "pm"),
  handover_accepted: n("project_handover_accepted", "head_iso", "eos"),
  defect_reported: n("project_defect_reported", "head_iso", "head_pmo"),
  defect_inherited: n("project_defect_inherited", "delivery_control"),
};

const HEADS: readonly Role[] = ["default_owner", "division_owner"];
const BCD_ROLES: readonly Role[] = ["requestor", "default_owner", "division_owner"];

/**
 * The people a handoff email goes to. An empty seat gets nothing. `except` is the person who did the thing: they
 * know already.
 */
export function projectRecipients(to: ProjectRecipient, project: { entity: string; team: ProjectTeam | null }, seats: readonly PaymentSeat[], org: OrgTree, except?: string): string[] {
  const covering = (s: PaymentSeat) => !!s.occupant && (s.entities.includes("*") || s.entities.includes(project.entity));
  const people = (list: readonly PaymentSeat[]) => [...new Set(list.map((s) => s.occupant!))].sort();
  let ids: string[];
  switch (to) {
    case "pm":
      ids = project.team?.pm ? [project.team.pm] : [];
      break;
    case "delivery_control":
      ids = project.team?.deliveryControl ? [project.team.deliveryControl] : [];
      break;
    case "project_admin":
      ids = project.team?.projectAdmin ? [project.team.projectAdmin] : [];
      break;
    case "head_pmo":
      ids = people(seats.filter((s) => HEADS.includes(s.role) && org.isWithin(DELIVERY_UNIT, s.orgUnit) && covering(s)));
      break;
    case "head_mso":
      ids = people(seats.filter((s) => HEADS.includes(s.role) && s.orgUnit === RECEIVER_UNIT && covering(s)));
      break;
    case "head_iso":
      ids = people(seats.filter((s) => HEADS.includes(s.role) && s.orgUnit === OPERATOR_UNIT && covering(s)));
      break;
    case "eos":
      ids = people(seats.filter((s) => org.isWithin(s.orgUnit, EOS_UNIT) && covering(s)));
      break;
    case "assurance":
      ids = people(seats.filter((s) => BCD_ROLES.includes(s.role) && org.isWithin(s.orgUnit, PIPELINE_UNIT) && covering(s)));
      break;
  }
  return ids.filter((id) => id !== except);
}
