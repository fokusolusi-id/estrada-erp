/** Surat Penawaran Harga (plan C1; sheet FC03_Sales_Pipeline; BR-SP-003). Sales writes, BFP reviews pricing, the Head BusDev approves. */
import type { Money } from "./money";
import type { OrgTree } from "./org";
import { PIPELINE_UNIT, canPipeline } from "./pipeline";
import type { Actor } from "./policy";
import type { Role } from "./roles";

export const SPH_STATES = ["pricing", "approval", "approved", "returned"] as const;
export type SphState = (typeof SPH_STATES)[number];
export const SPH_STATE_LABEL: Record<SphState, string> = { pricing: "Review Pricing", approval: "Menunggu persetujuan", approved: "Disetujui", returned: "Dikembalikan" };

export const SPH_ACTIONS = ["review", "approve", "return", "resubmit"] as const;
export type SphAction = (typeof SPH_ACTIONS)[number];
export const SPH_ACTION_LABEL: Record<SphAction, string> = { review: "Pricing sesuai", approve: "Setujui", return: "Kembalikan", resubmit: "Kirim ulang" };

/** SPH/PT/YY/NNNN, running per company and year. */
export const sphNumber = (entity: string, issuedOn: string, sequence: number) => `SPH/${entity}/${issuedOn.slice(2, 4)}/${String(sequence).padStart(4, "0")}`;

export function sphProblem(v: { price: Money; cogs: Money; issuedOn: string; today: string }): "amount" | "date" | null {
  if (!v.price.gt(0) || v.cogs.isNegative()) return "amount";
  return /^\d{4}-\d{2}-\d{2}$/.test(v.issuedOn) && v.issuedOn <= v.today ? null : "date";
}

/** Gross margin in percent of the offered price. */
export const sphMargin = (price: Money, cogs: Money) => price.minus(cogs).times(100).div(price).toDecimalPlaces(1);

export interface SphLike {
  state: SphState;
  entity: string;
  createdBy: string;
  createdRole: Role;
  createdUnit: string;
  reviewedBy: string | null;
}

const covers = (actor: Actor, entity: string) => actor.entities.includes("*") || actor.entities.includes(entity);
const isHead = (role: Role, unit: string) => role === "division_owner" && unit === PIPELINE_UNIT;

function reviews(s: SphLike, a: Actor) {
  return a.role === "bfp" && covers(a, s.entity) && a.userId !== s.createdBy;
}

/** The Head BusDev approves; the Direktur does when the Head BusDev wrote it. Never the writer or the reviewer. */
function approves(s: SphLike, a: Actor) {
  if (a.userId === s.createdBy || a.userId === s.reviewedBy || !covers(a, s.entity)) return false;
  return isHead(s.createdRole, s.createdUnit) ? a.role === "director" : isHead(a.role, a.orgUnit);
}

export type SphStepProblem = "not_allowed" | "note_required";

export function sphStep(s: SphLike, action: SphAction, actor: Actor, org: OrgTree, note: string): { to: SphState } | { problem: SphStepProblem } {
  const to: SphState | null =
    action === "review" && s.state === "pricing" && reviews(s, actor)
      ? "approval"
      : action === "approve" && s.state === "approval" && approves(s, actor)
        ? "approved"
        : action === "return" && ((s.state === "pricing" && reviews(s, actor)) || (s.state === "approval" && approves(s, actor)))
          ? "returned"
          : action === "resubmit" && s.state === "returned" && canPipeline(actor, "edit", s.entity, org)
            ? "pricing"
            : null;
  if (!to) return { problem: "not_allowed" };
  return action === "return" && !note.trim() ? { problem: "note_required" } : { to };
}

export const sphActions = (s: SphLike, actor: Actor, org: OrgTree): SphAction[] => SPH_ACTIONS.filter((a) => "to" in sphStep(s, a, actor, org, "x"));
