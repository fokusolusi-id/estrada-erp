/** Bank facilities, drawdowns and bank guarantees (plan B5; sheets FC08_Obligo_Bank, 14_Obligo_Status_Apr2026; BR-OBG-001..009). */
import { sum, ZERO, type Money } from "./money";
import type { OrgTree } from "./org";
import type { Actor } from "./policy";

export const FACILITY_TYPES = ["bg", "kmk", "ki", "trade_line"] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];
export const FACILITY_TYPE_LABEL: Record<FacilityType, string> = { bg: "Bank Garansi", kmk: "KMK", ki: "Kredit Investasi", trade_line: "Trade Line" };

export type DrawingKind = "loan" | "bg";
export const DRAWING_KIND_LABEL: Record<DrawingKind, string> = { loan: "Penarikan kredit", bg: "Bank Garansi" };

export const BG_TYPES = ["bid", "performance", "maintenance", "advance"] as const;
export type BgType = (typeof BG_TYPES)[number];
export const BG_TYPE_LABEL: Record<BgType, string> = { bid: "Penawaran", performance: "Pelaksanaan", maintenance: "Pemeliharaan", advance: "Uang Muka" };

export type DrawingState = "requested" | "issued" | "rejected" | "released";
export type DrawingStatus = "requested" | "rejected" | "released" | "repaid" | "expired" | "active";
export const DRAWING_STATUS_LABEL: Record<DrawingStatus, string> = { requested: "Menunggu persetujuan", rejected: "Ditolak", released: "Released", repaid: "Lunas", expired: "Expired", active: "Aktif" };

export const drawingKindsFor = (type: FacilityType): DrawingKind[] => (type === "bg" ? ["bg"] : type === "ki" ? ["loan"] : ["loan", "bg"]);

export interface DrawingAmount {
  id: string;
  kind: DrawingKind;
  state: DrawingState;
  amount: Money;
}

/** What a drawing still takes of the plafon: a loan less its principal repaid, a guarantee until it is released. */
export function drawingOwed(d: DrawingAmount, payments: readonly { drawingId: string | null; principal: Money }[]): Money {
  if (d.state !== "issued") return ZERO;
  return d.kind === "bg" ? d.amount : d.amount.minus(sum(payments.filter((p) => p.drawingId === d.id).map((p) => p.principal)));
}

export function facilityPosition(plafon: Money, drawings: readonly DrawingAmount[], payments: readonly { drawingId: string | null; principal: Money }[]) {
  const outstanding = sum(drawings.map((d) => drawingOwed(d, payments)));
  return { outstanding, available: plafon.minus(outstanding) };
}

export function drawingStatus(d: { kind: DrawingKind; state: DrawingState; dueOn: string | null }, owed: Money, today: string): DrawingStatus {
  if (d.state !== "issued") return d.state;
  if (d.kind === "loan" && owed.lte(0)) return "repaid";
  return d.kind === "bg" && !!d.dueOn && d.dueOn < today ? "expired" : "active";
}

export interface DrawingRequest {
  facility: { type: FacilityType; active: boolean; expiresOn: string | null };
  kind: DrawingKind;
  bgType: BgType | null;
  amount: Money;
  available: Money;
  projectId: string | null;
  /** The contract or KL the bank asks for, and its file. */
  underlying: string;
  hasDocument: boolean;
  today: string;
}
export type DrawingProblem = "closed" | "kind" | "amount" | "plafon" | "bg_type" | "project" | "underlying" | "document";

export function drawingProblem(r: DrawingRequest): DrawingProblem | null {
  if (!r.facility.active || (r.facility.expiresOn && r.facility.expiresOn < r.today)) return "closed";
  if (!drawingKindsFor(r.facility.type).includes(r.kind)) return "kind";
  if (!r.amount.gt(0)) return "amount";
  if (r.amount.gt(r.available)) return "plafon";
  if (r.kind === "bg" && !r.bgType) return "bg_type";
  if (r.kind === "bg" && !r.projectId) return "project";
  if (r.underlying.trim().length < 3) return "underlying";
  return r.hasDocument ? null : "document";
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export type IssueProblem = "state" | "own_request" | "reference" | "issued_on" | "due_on" | "plafon";

export function issueProblem(v: { state: DrawingState; requestedBy: string; actorId: string; reference: string; issuedOn: string; dueOn: string; today: string; amount: Money; available: Money }): IssueProblem | null {
  if (v.state !== "requested") return "state";
  if (v.requestedBy === v.actorId) return "own_request";
  if (!v.reference.trim()) return "reference";
  if (!isDate(v.issuedOn) || v.issuedOn > v.today) return "issued_on";
  if (!isDate(v.dueOn) || v.dueOn < v.issuedOn) return "due_on";
  return v.amount.gt(v.available) ? "plafon" : null;
}

/** The project's PM says the contract has ended; the PMO head does when the project has no PM. */
export function canConfirmRelease(actor: Actor, pm: string | null, org: OrgTree): boolean {
  if (pm) return actor.userId === pm;
  return (actor.role === "default_owner" || actor.role === "division_owner") && org.has(actor.orgUnit) && actor.orgUnit === "PMO";
}

export function releaseProblem(d: { kind: DrawingKind; state: DrawingState; confirmed: boolean }): "state" | "unconfirmed" | null {
  if (d.kind !== "bg" || d.state !== "issued") return "state";
  return d.confirmed ? null : "unconfirmed";
}

export type FacilityPaymentProblem = "amount" | "drawing" | "over" | "date";

/** Principal repays one loan drawing (`owed` is null when none is named); interest may stand alone. */
export function facilityPaymentProblem(p: { principal: Money; interest: Money; owed: Money | null; paidOn: string; today: string }): FacilityPaymentProblem | null {
  if (p.principal.isNegative() || p.interest.isNegative() || !p.principal.plus(p.interest).gt(0)) return "amount";
  if (p.principal.gt(0) && !p.owed) return "drawing";
  if (p.owed && p.principal.gt(p.owed)) return "over";
  return !isDate(p.paidOn) || p.paidOn > p.today ? "date" : null;
}

/** Banks holding more than half of all plafon (BR-OBG-009). `share` is in percent. */
export function bankConcentration(facilities: readonly { bank: string; plafon: Money }[]) {
  const total = sum(facilities.map((f) => f.plafon));
  if (total.lte(0)) return [];
  return [...new Set(facilities.map((f) => f.bank))]
    .map((bank) => ({ bank, share: sum(facilities.filter((f) => f.bank === bank).map((f) => f.plafon)).times(100).div(total) }))
    .filter((b) => b.share.gt(50));
}

/** The next monthly due date on or after today; a day past the month's end falls on its last day. */
export function nextDueDate(day: number, today: string): string {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const at = (offset: number) => {
    const last = new Date(Date.UTC(y, m + offset, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 1 + offset, Math.min(day, last))).toISOString().slice(0, 10);
  };
  return at(0) >= today ? at(0) : at(1);
}

export const EXPIRY_NOTICE_DAYS = 30;
export const INTEREST_NOTICE_DAYS = 7;
const daysUntil = (date: string, today: string) => (Date.parse(date) - Date.parse(today)) / 86_400_000;

export type ObligoReminderKind = "facility_expiry" | "interest_due" | "bg_expiry";

/** What falls due soon. `key` is unique per item and date, so each is announced once. */
export function obligoReminders(
  today: string,
  facilities: readonly { id: string; expiresOn: string | null; interestDay: number | null; owes: boolean }[],
  guarantees: readonly { id: string; dueOn: string | null }[],
) {
  const out: { kind: ObligoReminderKind; id: string; date: string; key: string }[] = [];
  const add = (kind: ObligoReminderKind, id: string, date: string | null, within: number) => {
    if (date && daysUntil(date, today) >= 0 && daysUntil(date, today) <= within) out.push({ kind, id, date, key: `${kind}:${id}:${date}` });
  };
  for (const f of facilities) {
    add("facility_expiry", f.id, f.expiresOn, EXPIRY_NOTICE_DAYS);
    if (f.owes && f.interestDay) add("interest_due", f.id, nextDueDate(f.interestDay, today), INTEREST_NOTICE_DAYS);
  }
  for (const g of guarantees) add("bg_expiry", g.id, g.dueOn, EXPIRY_NOTICE_DAYS);
  return out;
}
