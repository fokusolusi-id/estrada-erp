import type { ApprovalState } from "./approval";
import type { OrgTree } from "./org";
import { isParticipant } from "./notifications";
import type { Role } from "./roles";

export interface Actor {
  userId: string;
  role: Role;
  /** The position's org unit; scope covers its whole subtree. */
  orgUnit: string;
  /** Entities this user may see; "*" for all. */
  entities: readonly string[];
}

export interface LineResource {
  requestorUnit: string;
  ownerUnit: string;
  entity: string;
  state: ApprovalState;
}

export type Permission =
  | "line.view"
  | "line.edit"
  | "line.comment"
  | "coa.manage"
  | "org.manage"
  | "user.manage"
  | "report.view"
  | "audit.view"
  | "cycle.manage"
  | "actual.edit"
  | "allocation.manage"
  | "bank.manage"
  | "payment.report";

const COMPANY_WIDE: readonly Role[] = ["finance", "director", "auditor", "admin"];

function entityAllowed(actor: Actor, entity: string): boolean {
  return actor.entities.includes("*") || actor.entities.includes(entity);
}

function unitAllowed(actor: Actor, line: LineResource, org: OrgTree): boolean {
  if (COMPANY_WIDE.includes(actor.role)) return true;
  return org.isWithin(line.requestorUnit, actor.orgUnit) || org.isWithin(line.ownerUnit, actor.orgUnit);
}

export function can(actor: Actor, permission: Permission, resource: LineResource | null, org: OrgTree): boolean {
  switch (permission) {
    case "coa.manage":
      // COA Master belongs to Finance alone (CARA PENGISIAN point 6, confirmed by the client).
      return actor.role === "finance";
    case "org.manage":
    case "user.manage":
      return actor.role === "admin";
    case "audit.view":
      return actor.role === "auditor" || actor.role === "director" || actor.role === "admin";
    case "cycle.manage":
      return actor.role === "finance";
    case "report.view":
      return actor.role !== "requestor";
    case "line.view":
      // Admin manages master data only; budget content is out of its scope.
      if (!resource || actor.role === "admin") return false;
      return entityAllowed(actor, resource.entity) && unitAllowed(actor, resource, org);
    case "line.comment":
      // Everyone in the cycle who can see the line; Auditor reads the thread, and a locked line's thread is closed.
      return !!resource && resource.state !== "locked" && isParticipant(actor.role) && can(actor, "line.view", resource, org);
    case "actual.edit":
      // Realisasi 2026 is typed in by Finance for now (client answer 1). It sits beside the plan and never changes it,
      // so it may be filled in at any stage, after the lock included.
      return !!resource && actor.role === "finance" && entityAllowed(actor, resource.entity);
    case "allocation.manage":
      // Which costs are shared, and on what basis, changes reports only; a locked RKA keeps the split it was locked with.
      return !!resource && actor.role === "finance" && resource.state !== "locked" && entityAllowed(actor, resource.entity);
    case "bank.manage":
      // Company bank accounts are the "bank asal" Cash Management pays from; Admin may set them up before CM has an account.
      return actor.role === "cash_manager" || actor.role === "admin";
    case "payment.report":
      // Rekap Pembayaran: the paid list per day or month, for the Finance side, the Direktur and the Auditor.
      return ["finance", "bfp", "cash_manager", "director", "auditor"].includes(actor.role);
    case "line.edit": {
      if (!resource) return false;
      if (!entityAllowed(actor, resource.entity)) return false;
      if (actor.role === "requestor") {
        return resource.state === "draft" && org.isWithin(resource.requestorUnit, actor.orgUnit);
      }
      if (actor.role === "default_owner") {
        return resource.state === "consolidation" && unitAllowed(actor, resource, org);
      }
      if (actor.role === "finance") return resource.state === "finance_review";
      return false;
    }
  }
}
