import { APPROVAL_STATES, type ApprovalState } from "./approval";
import type { OrgTree } from "./org";

/** RKA Saya for a requestor: the lines its own unit asked for. Entity access stays with `can()`. */
export function requestedWithin(unit: string, org: OrgTree) {
  return (line: { requestorUnit: string }) => org.isWithin(line.requestorUnit, unit);
}

export interface LineKey {
  id?: string;
  requestorUnit: string;
  coaCode: string;
  entity: string;
  ownerUnit: string;
  /** Written by the headcount plan: one line per position, all on the same salary COA. */
  planned?: boolean;
}

/**
 * A requesting unit enters a COA once per entity and budget owner; the same COA for another entity or
 * owner is a different line. Returns the line already holding that slot, or null.
 */
export function duplicateOf<L extends LineKey>(line: LineKey, others: readonly L[]): L | null {
  if (line.planned) return null;
  return (
    others.find(
      (o) =>
        !o.planned &&
        (!line.id || o.id !== line.id) &&
        o.requestorUnit === line.requestorUnit &&
        o.coaCode === line.coaCode &&
        o.entity === line.entity &&
        o.ownerUnit === line.ownerUnit,
    ) ?? null
  );
}

export interface RequestorOverview {
  drafts: number;
  /** Drafts that came back with a change request still open. */
  returned: number;
  /** Lines with at least one comment in their discussion. */
  discussed: number;
  submitted: number;
  /** Sent lines per stage, in cycle order; stages with nothing keep a zero. */
  positions: { state: Exclude<ApprovalState, "draft">; count: number }[];
}

/** What a requestor needs at a glance: how much is sent, where it sits, and what waits on them. */
export function requestorOverview(lines: readonly { state: ApprovalState; returned: boolean; commentCount: number }[]): RequestorOverview {
  const sent = lines.filter((l) => l.state !== "draft");
  return {
    drafts: lines.length - sent.length,
    returned: lines.filter((l) => l.state === "draft" && l.returned).length,
    discussed: lines.filter((l) => l.commentCount > 0).length,
    submitted: sent.length,
    positions: APPROVAL_STATES.filter((s): s is Exclude<ApprovalState, "draft"> => s !== "draft").map((state) => ({
      state,
      count: sent.filter((l) => l.state === state).length,
    })),
  };
}
