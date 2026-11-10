import type { AllocationBasis } from "./allocation";
import type { EntityOpening } from "./cash";
import type { VersionStatus } from "./cycle";
import { sum, ZERO, type Money } from "./money";

/**
 * The app runs every year. Each screen shows one fiscal year at a time, compares it with the year before, and a new
 * year starts from the last one's locked RKA, closing cash and loans.
 */

type V = { fiscalYear: number; status: VersionStatus; copiedFromId: string | null };

/** What the app calls a version: the RKA of its year. Stored names (v2, "Upd Fin") stay on Siklus RKA only. */
export const rkaLabel = (v: { fiscalYear: number }) => `RKA ${v.fiscalYear}`;

/** The year a plan is compared with: its RKA and its actuals. */
export const priorYear = (fiscalYear: number) => fiscalYear - 1;

/**
 * The year the screens show: the viewer's choice when that year has a version, else the newest year with an open
 * version, else the newest year. Archived versions are history and never chosen.
 */
export function pickYear(choice: string | undefined, versions: readonly V[]): number | null {
  const live = versions.filter((v) => v.status !== "archived");
  const years = [...new Set(live.map((v) => v.fiscalYear))].sort((a, b) => b - a);
  const wanted = Number(choice);
  if (years.includes(wanted)) return wanted;
  return live.filter((v) => v.status === "open").map((v) => v.fiscalYear).sort((a, b) => b - a)[0] ?? years[0] ?? null;
}

/**
 * A new year opens when no version of it is open, and no other year is still on its first version: two years are
 * open together only while one of them is being revised.
 */
export function newYearProblem(fiscalYear: number, versions: readonly V[]): "already_open" | "other_year_open" | null {
  const open = versions.filter((v) => v.status === "open");
  if (open.some((v) => v.fiscalYear === fiscalYear)) return "already_open";
  if (open.some((v) => v.fiscalYear !== fiscalYear && !v.copiedFromId)) return "other_year_open";
  return null;
}

export interface CarriedLine {
  coaCode: string;
  entityCode: string;
  requestorUnit: string;
  ownerUnit: string;
  item: string | null;
  basis: string | null;
  notes: string | null;
  crossDivision: boolean;
  months: Money[];
  sharedBasis: AllocationBasis | null;
  sharedFixed: Record<string, string> | null;
}

/**
 * Next year's starting point: last year's locked lines copied as Draft, months included for each unit to adjust,
 * with last year's total kept as the comparison. Last year's actual is entered once on the new year's Realisasi.
 */
export function carryLinesForward(lines: readonly CarriedLine[]): (CarriedLine & { state: "draft"; priorRka: Money; priorActual: null })[] {
  return lines.map((l) => ({ ...l, months: [...l.months], state: "draft", priorRka: sum(l.months), priorActual: null }));
}

export interface CarriedFacility {
  name: string;
  type: "existing" | "new";
  entity: string;
  rate: string;
  creditLimit: Money | null;
  notes: string | null;
  outstanding: readonly Money[];
}

/**
 * Next year's cash position from this year's December: each entity opens at its closing cash, receivables and
 * payables and keeps its buffer; last year's PPh 29 is left for Finance to enter. Loans carry at their December
 * outstanding as existing facilities; paid-off ones are dropped. Finance confirms against the audited balance sheet.
 */
export function carryCashForward(
  forecasts: ReadonlyMap<string, { rows: { closing: readonly Money[]; receivablesEnd: readonly Money[]; payablesEnd: readonly Money[] }; minimumCash: Money }>,
  facilities: readonly CarriedFacility[],
): { openings: Map<string, EntityOpening>; facilities: (Omit<CarriedFacility, "outstanding"> & { openingBalance: Money })[] } {
  const dec = (m: readonly Money[]) => m[11] ?? ZERO;
  return {
    openings: new Map(
      [...forecasts].map(([entity, f]) => [
        entity,
        { cash: dec(f.rows.closing), receivables: dec(f.rows.receivablesEnd), payables: dec(f.rows.payablesEnd), priorYearTax: ZERO, minimumCash: f.minimumCash },
      ]),
    ),
    facilities: facilities
      .filter((f) => dec(f.outstanding).gt(0))
      .map(({ outstanding, ...f }) => ({ ...f, type: "existing" as const, openingBalance: dec(outstanding) })),
  };
}
