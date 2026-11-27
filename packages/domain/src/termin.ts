/** Billing termin defaults and follow-up (plan E5; sheets 42_Jadwal_Termin, 22_Assumptions). */
import type { InvoiceState } from "./invoice";
import { sum, ZERO, type Money } from "./money";
import type { TerminInput } from "./pipeline";

/** DP, progress and retention in percent. */
export const TERMIN_SHARE = { dp: 15, progress: 80, retention: 5 } as const;
/** Days after SPPBJ for the DP, months after it for the progress termin, and months after that for retention. */
export const TERMIN_OFFSET = { dpDays: 30, progressMonths: 3, retentionMonths: 6 } as const;

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

/** The three standard termin of a contract signed (SPPBJ) on a date; progress takes the rounding. */
export function defaultTermins(value: Money, sppbj: string): (TerminInput & { description: string })[] {
  const share = (percent: number) => value.times(percent).div(100).toDecimalPlaces(2);
  const [dp, retention] = [share(TERMIN_SHARE.dp), share(TERMIN_SHARE.retention)];
  const progress = value.minus(dp).minus(retention);
  const progressOn = addMonths(sppbj, TERMIN_OFFSET.progressMonths);
  const termin = (description: string, amount: Money, plannedDate: string) => ({ description, amount: amount.toFixed(2), plannedDate });
  return [
    termin(`DP ${TERMIN_SHARE.dp}%`, dp, addDays(sppbj, TERMIN_OFFSET.dpDays)),
    termin(`Termin (progress) ${TERMIN_SHARE.progress}%`, progress, progressOn),
    termin(`Retensi ${TERMIN_SHARE.retention}%`, retention, addMonths(progressOn, TERMIN_OFFSET.retentionMonths)),
  ];
}

export type TerminStatus = "billed" | "drafted" | "overdue" | "planned";
export const TERMIN_STATUS_LABEL: Record<TerminStatus, string> = { billed: "Sudah ditagih", drafted: "Invoice disiapkan", overdue: "Terlambat", planned: "Direncanakan" };

export interface ScheduledTermin {
  dealId: string;
  no: number;
  plannedOn: string;
  amount: Money;
}

/**
 * Each termin against its invoice. Billed means issued (its DPP counts, in the invoice's month); one past its planned
 * date and not issued is overdue. Rows run by planned date; the monthly totals cover the year.
 */
export function terminSchedule<T extends ScheduledTermin>(
  termins: readonly T[],
  invoices: readonly { dealId: string; no: number; state: InvoiceState; dpp: Money; invoicedOn: string }[],
  year: number,
  today: string,
) {
  const live = new Map(invoices.filter((i) => i.state !== "cancelled").map((i) => [`${i.dealId}|${i.no}`, i]));
  const rows = [...termins]
    .sort((a, b) => a.plannedOn.localeCompare(b.plannedOn) || a.no - b.no)
    .map((t) => {
      const invoice = live.get(`${t.dealId}|${t.no}`);
      const issued = invoice?.state === "issued";
      const status: TerminStatus = issued ? "billed" : t.plannedOn < today ? "overdue" : invoice ? "drafted" : "planned";
      return { ...t, status, billed: issued ? invoice.dpp : ZERO, invoicedOn: issued ? invoice.invoicedOn : null };
    });
  const monthly = (entries: readonly { on: string | null; amount: Money }[]): Money[] =>
    Array.from({ length: 12 }, (_, m) => sum(entries.filter((e) => e.on?.startsWith(`${year}-${String(m + 1).padStart(2, "0")}`)).map((e) => e.amount)));
  return {
    rows,
    planned: monthly(rows.map((r) => ({ on: r.plannedOn, amount: r.amount }))),
    billed: monthly(rows.map((r) => ({ on: r.invoicedOn, amount: r.billed }))),
    overdue: rows.filter((r) => r.status === "overdue").length,
  };
}
