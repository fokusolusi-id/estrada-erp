/** PPN and PPh from invoices and vendor bills (plan B6; sheet P1_Module_Spec P1-M11; client decisions on export, PPh 21 and numbers). */
import type { PphType } from "./invoice";
import { sum, type Money } from "./money";

export const TAX_KINDS = ["faktur_out", "faktur_in", "bupot"] as const;
export type TaxKind = (typeof TAX_KINDS)[number];
export const TAX_KIND_LABEL: Record<TaxKind, string> = { faktur_out: "Faktur Pajak Keluaran", faktur_in: "Faktur Pajak Masukan", bupot: "Bukti Potong PPh" };

export const TAX_STATUSES = ["recorded", "uploaded", "approved", "rejected"] as const;
export type TaxStatus = (typeof TAX_STATUSES)[number];
export const TAX_STATUS_LABEL: Record<TaxStatus, string> = { recorded: "Dicatat", uploaded: "Diunggah", approved: "Disetujui DJP", rejected: "Ditolak DJP" };

/** One faktur or bukti potong the books call for, with what Accounting recorded for it. */
export interface TaxItem {
  kind: TaxKind;
  entity: string;
  /** The invoice, vendor bill or payment date. */
  baseDate: string;
  dpp: Money;
  /** PPN for a faktur, PPh for a bukti potong. */
  amount: Money;
  /** The customer collects the PPN. */
  wapu: boolean;
  /** Null on requests saved before PPh types. */
  pphType: PphType | null;
  document: { number: string; date: string; status: TaxStatus } | null;
}

export const taxPeriodOf = (i: TaxItem) => (i.document?.date ?? i.baseDate).slice(0, 7);
export const bupotNeeded = (pph: Money) => pph.gt(0);

export const TAX_LATE_DAYS = 7;

/** Ours must be uploaded within 7 days; the vendor's faktur only has to be recorded. */
export function taxLate(i: TaxItem, today: string): boolean {
  if ((Date.parse(today) - Date.parse(i.baseDate)) / 86_400_000 <= TAX_LATE_DAYS) return false;
  if (i.kind === "faktur_in") return !i.document;
  return i.document?.status !== "uploaded" && i.document?.status !== "approved";
}

export function taxDocumentProblem(v: { number: string; date: string; status: TaxStatus; today: string }): "number" | "date" | null {
  if (v.number.trim().length < 5) return "number";
  return !/^\d{4}-\d{2}-\d{2}$/.test(v.date) || v.date > v.today ? "date" : null;
}

/** A month's SPT figures. PPN masukan counts once its faktur is recorded. */
export function taxReport(items: readonly TaxItem[], at: { period: string; entities: readonly string[]; pph21: Money; withheldFromUs: Money }) {
  const here = items.filter((i) => taxPeriodOf(i) === at.period && at.entities.includes(i.entity));
  const total = (pick: (i: TaxItem) => boolean) => sum(here.filter(pick).map((i) => i.amount));
  const ppnOut = total((i) => i.kind === "faktur_out" && !i.wapu);
  const ppnIn = total((i) => i.kind === "faktur_in" && !!i.document && i.document.status !== "rejected");
  const bupot = here.filter((i) => i.kind === "bupot");
  const types = [...new Set(bupot.map((i) => i.pphType))].sort((a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)));
  const withheld = types.map((type) => ({ type, amount: total((i) => i.kind === "bupot" && i.pphType === type) }));
  return {
    ppnOut,
    ppnWapu: total((i) => i.kind === "faktur_out" && i.wapu),
    ppnIn,
    ppnInUnrecorded: total((i) => i.kind === "faktur_in").minus(ppnIn),
    /** Negative means overpaid. */
    ppnDue: ppnOut.minus(ppnIn),
    withheld,
    pph21: at.pph21,
    pphDue: sum(withheld.map((w) => w.amount)).plus(at.pph21),
    withheldFromUs: at.withheldFromUs,
  };
}
export type TaxReport = ReturnType<typeof taxReport>;
