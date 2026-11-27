/** Invoices from billing termin (plan B1; sheets FC07_Finance, 19_Form_Field_Spec, 42_Jadwal_Termin; BR-FIN-001, BR-FIN-006). */
import { ZERO, money, type Money } from "./money";

export const INVOICE_STATES = ["draft", "validated", "approved", "issued", "cancelled"] as const;
export type InvoiceState = (typeof INVOICE_STATES)[number];
export const INVOICE_STATE_LABEL: Record<InvoiceState, string> = { draft: "Draft", validated: "Pajak tervalidasi", approved: "Disetujui", issued: "Terbit", cancelled: "Dibatalkan" };

export const PPH_TYPES = ["none", "pph23", "pph42", "pph22"] as const;
export type PphType = (typeof PPH_TYPES)[number];
export const PPH_LABEL: Record<PphType, string> = { none: "Tanpa PPh", pph23: "PPh 23", pph42: "PPh 4(2)", pph22: "PPh 22" };
/** Only PPh 23's rate is in the sheets (42_Jadwal_Termin: 2%); the others are typed. */
export const PPH_DEFAULT_RATE: Record<PphType, string> = { none: "0", pph23: "2", pph42: "", pph22: "" };

/** UU HPP, as 42_Jadwal_Termin gives it. */
export const PPN_RATE = money("11");

/** Amounts to the sen. A Wapu customer is shown the PPN and pays it to the state, so it is not ours to receive. */
export function invoiceAmounts({ billed, penalty, fine, wapu, pphRate }: { billed: Money; penalty: Money; fine: Money; wapu: boolean; pphRate: Money }) {
  const dpp = billed.minus(penalty).minus(fine);
  const ppn = dpp.times(PPN_RATE).div(100).toDecimalPlaces(2);
  const pph = dpp.times(pphRate).div(100).toDecimalPlaces(2);
  const total = dpp.plus(ppn);
  return { dpp, ppn, pph, total, receivable: total.minus(pph).minus(wapu ? ppn : ZERO) };
}

export type InvoiceProblem = "deduction" | "dpp" | "pph" | "date";

export function invoiceProblem(v: { billed: Money; penalty: Money; fine: Money; pphRate: Money; pphType: PphType; invoicedOn: string; today: string }): InvoiceProblem | null {
  if (v.penalty.isNegative() || v.fine.isNegative()) return "deduction";
  if (!v.billed.minus(v.penalty).minus(v.fine).gt(0)) return "dpp";
  if (v.pphRate.isNegative() || v.pphRate.gt(100) || (v.pphType === "none") !== v.pphRate.isZero()) return "pph";
  return /^\d{4}-\d{2}-\d{2}$/.test(v.invoicedOn) && v.invoicedOn <= v.today ? null : "date";
}

/** Invoice date plus the customer's term of payment; 30 days when none is recorded (P1_Module_Spec top_days). */
export function dueDate(invoicedOn: string, termDays: number | null): string {
  const date = new Date(`${invoicedOn}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (termDays ?? 30));
  return date.toISOString().slice(0, 10);
}

/** INV/PT/YY/NNNN, running per PT per year (19_Form_Field_Spec). */
export const invoiceNumber = (entity: string, invoicedOn: string, sequence: number) => `INV/${entity}/${invoicedOn.slice(2, 4)}/${String(sequence).padStart(4, "0")}`;

export const INVOICE_ACTIONS = ["validate", "approve", "issue", "return", "cancel"] as const;
export type InvoiceAction = (typeof INVOICE_ACTIONS)[number];
export const INVOICE_ACTION_LABEL: Record<InvoiceAction, string> = { validate: "Validasi pajak", approve: "Setujui", issue: "Terbitkan", return: "Kembalikan", cancel: "Batalkan" };

export type InvoiceStepProblem = "wrong_state" | "not_allowed" | "own_invoice" | "note_required";

const STEPS: Record<InvoiceAction, { from: readonly InvoiceState[]; to: InvoiceState; by: "creator" | "approver" }> = {
  validate: { from: ["draft"], to: "validated", by: "creator" },
  approve: { from: ["validated"], to: "approved", by: "approver" },
  issue: { from: ["approved"], to: "issued", by: "approver" },
  return: { from: ["validated", "approved"], to: "draft", by: "approver" },
  cancel: { from: ["draft", "validated"], to: "cancelled", by: "creator" },
};

/** Generator != tax validator != approver (FC07_Finance SoD). */
export function invoiceStep(
  from: InvoiceState,
  action: InvoiceAction,
  ctx: { actorId: string; createdBy: string; validatedBy: string | null; mayCreate: boolean; mayApprove: boolean; note: string },
): { to: InvoiceState } | { problem: InvoiceStepProblem } {
  const step = STEPS[action];
  if (!(step.by === "creator" ? ctx.mayCreate : ctx.mayApprove)) return { problem: "not_allowed" };
  if (!step.from.includes(from)) return { problem: "wrong_state" };
  if (action === "validate" && ctx.actorId === ctx.createdBy) return { problem: "own_invoice" };
  if ((action === "approve" || action === "issue") && (ctx.actorId === ctx.createdBy || ctx.actorId === ctx.validatedBy)) return { problem: "own_invoice" };
  if ((action === "return" || action === "cancel") && !ctx.note.trim()) return { problem: "note_required" };
  return { to: step.to };
}

export const invoiceActions = (state: InvoiceState, ctx: Omit<Parameters<typeof invoiceStep>[2], "note">): InvoiceAction[] =>
  INVOICE_ACTIONS.filter((a) => "to" in invoiceStep(state, a, { ...ctx, note: "x" }));

/** The first invoiced termin that a change to the deal would remove or re-price, or null. */
export function terminChangeProblem(next: readonly { no: number; amount: Money }[], invoiced: readonly { no: number; amount: Money }[]): number | null {
  return invoiced.find((i) => !next.some((t) => t.no === i.no && t.amount.eq(i.amount)))?.no ?? null;
}
