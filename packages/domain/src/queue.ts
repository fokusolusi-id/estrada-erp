import { allowedActions, type ApprovalAction, type ApprovalConfig, type ApprovalState } from "./approval";
import { seatFor, type OrgTree, type Position } from "./org";
import type { Actor, LineResource } from "./policy";
import type { Role } from "./roles";

function inEntity(actor: Actor, entity: string): boolean {
  return actor.entities.includes("*") || actor.entities.includes(entity);
}

/**
 * The approval actions this position may take on this line now: the state machine's rule for the role,
 * narrowed to the position's scope. Requestors act on lines their unit requested; owners act on lines
 * budgeted under their unit (cross-division lines go to the budget owner); Finance and the lock role
 * act company-wide within their entities.
 */
export function actionsFor(
  actor: Actor,
  line: LineResource,
  org: OrgTree,
  cfg: ApprovalConfig = { lockRole: "director" },
): ApprovalAction[] {
  if (!inEntity(actor, line.entity)) return [];
  const actions = allowedActions(line.state, actor.role, cfg);
  if (!actions.length) return [];
  switch (actor.role) {
    case "requestor":
      return org.isWithin(line.requestorUnit, actor.orgUnit) ? actions : [];
    case "default_owner":
    case "division_owner":
      return org.isWithin(line.ownerUnit, actor.orgUnit) ? actions : [];
    case "finance":
    case "director":
      return actions;
    default:
      return [];
  }
}

export interface Handoff {
  ownerUnit: string;
  count: number;
  requestors: string[];
}

/** Lines moved together, grouped by budget owner unit: each group is one email to that unit's holder. */
export function handoffs(lines: readonly { ownerUnit: string; createdBy: string | null }[]): Handoff[] {
  const byUnit = new Map<string, { count: number; requestors: Set<string> }>();
  for (const l of lines) {
    const g = byUnit.get(l.ownerUnit) ?? { count: 0, requestors: new Set<string>() };
    g.count += 1;
    if (l.createdBy) g.requestors.add(l.createdBy);
    byUnit.set(l.ownerUnit, g);
  }
  return [...byUnit].map(([ownerUnit, g]) => ({ ownerUnit, count: g.count, requestors: [...g.requestors] }));
}

/** The seat each state waits on; the other states are acted on company-wide or by the requestor. */
const SEAT_ROLE: Partial<Record<ApprovalState, Role>> = {
  consolidation: "default_owner",
  division_approval: "division_owner",
};

export interface BlockedSeat {
  unit: string;
  role: Role;
  exists: boolean;
  count: number;
}

/** Vacant (or never created) seats that lines are waiting on. Admin fills them by assigning a pjs. */
export function blockedSeats(
  lines: readonly { ownerUnit: string; state: ApprovalState }[],
  positions: readonly Position[],
  org: OrgTree,
): BlockedSeat[] {
  const out = new Map<string, BlockedSeat>();
  for (const l of lines) {
    const role = SEAT_ROLE[l.state];
    if (!role) continue;
    const seat = seatFor(l.ownerUnit, role, positions, org);
    if (seat.holder) continue;
    const key = `${seat.unit}:${role}`;
    const acc = out.get(key) ?? { unit: seat.unit, role, exists: seat.exists, count: 0 };
    acc.count += 1;
    out.set(key, acc);
  }
  return [...out.values()];
}
