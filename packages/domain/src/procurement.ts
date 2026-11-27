/** Purchase request, purchase order and goods receipt (plan C3; sheet FC05_SCM_Pengadaan; BR-SCM-001..004). */
import Decimal from "decimal.js";
import { ZERO, type Money } from "./money";
import type { OrgTree } from "./org";
import type { Actor } from "./policy";
import type { Role } from "./roles";

export const PR_STATES = ["requested", "approved", "rejected"] as const;
export type PrState = (typeof PR_STATES)[number];
export const PR_STATE_LABEL: Record<PrState, string> = { requested: "Cek budget", approved: "Budget disetujui", rejected: "Ditolak" };

export const PO_STATES = ["head", "frm", "director", "approved", "returned", "cancelled"] as const;
export type PoState = (typeof PO_STATES)[number];
export const PO_STATE_LABEL: Record<PoState, string> = { head: "Menunggu Head SCM", frm: "Menunggu Head FRM", director: "Menunggu Direktur", approved: "Disetujui", returned: "Dikembalikan", cancelled: "Dibatalkan" };

export const PO_ACTIONS = ["approve", "return", "resubmit", "cancel"] as const;
export type PoAction = (typeof PO_ACTIONS)[number];
export const PO_ACTION_LABEL: Record<PoAction, string> = { approve: "Setujui", return: "Kembalikan", resubmit: "Kirim ulang", cancel: "Batalkan" };

export const prNumber = (entity: string, date: string, sequence: number) => `PR/${entity}/${date.slice(2, 4)}/${String(sequence).padStart(4, "0")}`;
/** NNN/<PT>-PO/MM/YYYY, running per company per month (BR-SCM-001). */
export const poNumber = (entity: string, date: string, sequence: number) => `${String(sequence).padStart(3, "0")}/${entity}-PO/${date.slice(5, 7)}/${date.slice(0, 4)}`;

const STAFF: readonly Role[] = ["requestor", "default_owner", "division_owner"];
const covers = (a: Actor, entity: string) => a.entities.includes("*") || a.entities.includes(entity);
const staffIn = (a: Actor, unit: string, org: OrgTree) => STAFF.includes(a.role) && org.isWithin(a.orgUnit, unit);

/** The project's PM, or PMO's people. */
export const canRequestPurchase = (a: Actor, project: { entity: string; pm: string | null }, org: OrgTree) => covers(a, project.entity) && (a.userId === project.pm || staffIn(a, "PMO", org));
/** Finance-Pricing checks the request against the RKA, never its own. */
export const canCheckBudget = (a: Actor, request: { entity: string; createdBy: string }) => (a.role === "bfp" || a.role === "finance") && covers(a, request.entity) && a.userId !== request.createdBy;
export const canWritePo = (a: Actor, entity: string, org: OrgTree) => covers(a, entity) && staffIn(a, "SCM", org);
export const isScmHead = (role: Role, unit: string) => (role === "default_owner" || role === "division_owner") && unit === "SCM";

export interface PoLike {
  state: PoState;
  entity: string;
  createdBy: string;
  /** Who raised the purchase request. */
  requestedBy: string;
  createdByScmHead: boolean;
  /** Above the requesting unit's cost center limit. */
  overLimit: boolean;
  /** Something has been received against it. */
  received?: boolean;
}

function approver(po: PoLike, a: Actor): boolean {
  if (!covers(a, po.entity) || a.userId === po.createdBy || a.userId === po.requestedBy) return false;
  if (po.state === "head") return po.createdByScmHead ? a.role === "division_owner" && a.orgUnit === "PDMS" : isScmHead(a.role, a.orgUnit);
  if (po.state === "frm") return a.role === "division_owner" && a.orgUnit === "FRM";
  return po.state === "director" && a.role === "director";
}

export function poStep(po: PoLike, action: PoAction, actor: Actor, org: OrgTree, note: string): { to: PoState } | { problem: "not_allowed" | "note_required" } {
  const waiting = po.state === "head" || po.state === "frm" || po.state === "director";
  const buyer = canWritePo(actor, po.entity, org) || actor.userId === po.createdBy;
  const to: PoState | null =
    action === "approve" && approver(po, actor)
      ? po.state === "head" ? (po.overLimit ? "frm" : "approved") : po.state === "frm" ? "director" : "approved"
      : action === "return" && approver(po, actor)
        ? "returned"
        : action === "resubmit" && po.state === "returned" && buyer
          ? "head"
          : action === "cancel" && buyer && (waiting || po.state === "returned" || (po.state === "approved" && !po.received))
            ? "cancelled"
            : null;
  if (!to) return { problem: "not_allowed" };
  return (action === "return" || action === "cancel") && !note.trim() ? { problem: "note_required" } : { to };
}

export const poActions = (po: PoLike, actor: Actor, org: OrgTree): PoAction[] => PO_ACTIONS.filter((a) => "to" in poStep(po, a, actor, org, "x"));

export function poProblem(v: { qty: Money; unitPrice: Money; estimate: Money; ordered: Money; date: string; today: string }): "qty" | "price" | "over_request" | "date" | null {
  if (!v.qty.gt(0)) return "qty";
  if (!v.unitPrice.gt(0)) return "price";
  if (v.qty.times(v.unitPrice).plus(v.ordered).gt(v.estimate)) return "over_request";
  return /^\d{4}-\d{2}-\d{2}$/.test(v.date) && v.date <= v.today ? null : "date";
}

export function goodsReceiptProblem(v: { state: PoState; amount: Money; received: Money; poAmount: Money; receivedOn: string; poDate: string; today: string; actorId: string; createdBy: string }): "state" | "own" | "amount" | "over" | "date" | null {
  if (v.state !== "approved") return "state";
  if (v.actorId === v.createdBy) return "own";
  if (!v.amount.gt(0)) return "amount";
  if (v.amount.plus(v.received).gt(v.poAmount)) return "over";
  return /^\d{4}-\d{2}-\d{2}$/.test(v.receivedOn) && v.receivedOn >= v.poDate && v.receivedOn <= v.today ? null : "date";
}

/** PO, receipt and vendor bill agree: same Mitra and company, and billed no further than received. `billed` is the PO's other bills. */
export function matchProblem(v: { po: { state: PoState; partnerId: string; entity: string }; bill: { partnerId: string | null; entity: string; gross: Money }; received: Money; billed: Money }): "state" | "partner" | "entity" | "over" | null {
  if (v.po.state !== "approved") return "state";
  if (v.bill.partnerId !== v.po.partnerId) return "partner";
  if (v.bill.entity !== v.po.entity) return "entity";
  return v.bill.gross.plus(v.billed).gt(v.received) ? "over" : null;
}

export const openCommitment = (ordered: Money, billed: Money): Money => Decimal.max(ZERO, ordered.minus(billed));
