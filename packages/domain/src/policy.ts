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
  | "cycle.manage";

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
