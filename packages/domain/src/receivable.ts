/** Cash receipts and AR aging (plan B2; sheets FC07_Finance and P1_Module_Spec P1-M2; BR-FIN-002). */
import type { InvoiceState } from "./invoice";
import { ZERO, sum, type Money } from "./money";

const DAY = 86_400_000;

/** What is still expected from the customer. */
export function outstandingOf(invoice: { receivable: Money }, received: Money): Money {
  const left = invoice.receivable.minus(received);
  return left.gt(0) ? left : ZERO;
}

export type ReceiptProblem = "not_issued" | "own_invoice" | "amount" | "over" | "date";

export function receiptProblem(
  invoice: { total: Money; invoicedOn: string; createdBy: string; validatedBy: string | null; approvedBy: string | null },
  r: { amount: Money; received: Money; receivedOn: string; today: string; actorId: string; state: InvoiceState },
): ReceiptProblem | null {
  if (r.state !== "issued") return "not_issued";
  // Generator != approver != receiver of the payment (FC07_Finance SoD).
  if ([invoice.createdBy, invoice.validatedBy, invoice.approvedBy].includes(r.actorId)) return "own_invoice";
  if (!r.amount.gt(0)) return "amount";
  if (r.received.plus(r.amount).gt(invoice.total)) return "over";
  return /^\d{4}-\d{2}-\d{2}$/.test(r.receivedOn) && r.receivedOn >= invoice.invoicedOn && r.receivedOn <= r.today ? null : "date";
}

export const AGING_BUCKETS = ["current", "d30", "d60", "d90", "over90"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];
export const AGING_LABEL: Record<AgingBucket, string> = { current: "Belum jatuh tempo", d30: "1–30 hari", d60: "31–60 hari", d90: "61–90 hari", over90: "> 90 hari" };

const daysPast = (dueOn: string, asOf: string) => Math.round((Date.parse(asOf) - Date.parse(dueOn)) / DAY);

export function agingBucket(dueOn: string, asOf: string): AgingBucket {
  const days = daysPast(dueOn, asOf);
  return days <= 0 ? "current" : days <= 30 ? "d30" : days <= 60 ? "d60" : days <= 90 ? "d90" : "over90";
}

export function agingByCustomer(open: readonly { customer: string; dueOn: string; outstanding: Money }[], asOf: string) {
  const rows = new Map<string, Record<AgingBucket, Money>>();
  for (const i of open) {
    if (!i.outstanding.gt(0)) continue;
    const row = rows.get(i.customer) ?? (Object.fromEntries(AGING_BUCKETS.map((b) => [b, ZERO])) as Record<AgingBucket, Money>);
    const bucket = agingBucket(i.dueOn, asOf);
    rows.set(i.customer, { ...row, [bucket]: row[bucket].plus(i.outstanding) });
  }
  return [...rows]
    .map(([customer, buckets]) => ({ customer, buckets, total: sum(Object.values(buckets)) }))
    .sort((a, b) => b.total.comparedTo(a.total) || a.customer.localeCompare(b.customer));
}

/** The week's review: unpaid invoices overdue or due within seven days. `daysOverdue` is negative before the due date. */
export function reviewList<T extends { dueOn: string; outstanding: Money }>(open: readonly T[], asOf: string): (T & { daysOverdue: number })[] {
  return open
    .filter((i) => i.outstanding.gt(0))
    .map((i) => ({ ...i, daysOverdue: daysPast(i.dueOn, asOf) }))
    .filter((i) => i.daysOverdue >= -7)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** Twelve months from `asOf`: open invoices at their due dates, unbilled termin at their expected dates; anything late falls in the first month. */
export function cashInForecast(invoiced: readonly { on: string; amount: Money }[], planned: readonly { on: string; amount: Money }[], asOf: string) {
  const [year, month] = [Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7))];
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, month - 1 + i, 1)).toISOString().slice(0, 7));
  const into = (items: typeof invoiced, m: string) => sum(items.filter((x) => (x.on.slice(0, 7) < months[0]! ? months[0]! : x.on.slice(0, 7)) === m).map((x) => x.amount));
  return months.map((m) => ({ month: m, invoiced: into(invoiced, m), planned: into(planned, m) }));
}
