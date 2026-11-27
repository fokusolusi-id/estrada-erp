/** Periodic reports with review and approval (plan D4; FC09, BR-RPT-001..003). */
import { isCfo } from "./home";
import type { OrgTree } from "./org";
import type { Actor } from "./policy";

const MONTH_LABELS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export const REPORT_KINDS = ["pnl", "balance", "cashflow", "variance", "aging", "sales", "delivery", "obligo"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  pnl: "Laba Rugi", balance: "Neraca", cashflow: "Arus Kas", variance: "Realisasi vs RKA", aging: "Umur Piutang", sales: "Sales", delivery: "Implementasi", obligo: "Obligo Bank",
};

export const PERIOD_TYPES = ["month", "quarter", "semester", "year"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];
export const PERIOD_TYPE_LABEL: Record<PeriodType, string> = { month: "Bulanan", quarter: "Triwulan", semester: "Semester", year: "Tahunan" };
const SPAN: Record<PeriodType, number> = { month: 1, quarter: 3, semester: 6, year: 12 };

/** The months a period covers; none for a number the year does not have. */
export function reportMonths(type: PeriodType, no: number): number[] {
  const span = SPAN[type];
  if (!Number.isInteger(no) || no < 1 || no > 12 / span) return [];
  return Array.from({ length: span }, (_, i) => (no - 1) * span + i + 1);
}

export function periodLabel(type: PeriodType, no: number, year: number): string {
  const roman = ["I", "II", "III", "IV"][no - 1];
  return type === "month" ? `${MONTH_LABELS[no - 1]} ${year}` : type === "quarter" ? `Triwulan ${roman} ${year}` : type === "semester" ? `Semester ${roman} ${year}` : `Tahun ${year}`;
}

export const REPORT_STATES = ["draft", "submitted", "reviewed", "approved", "distributed"] as const;
export type ReportState = (typeof REPORT_STATES)[number];
export const REPORT_STATE_LABEL: Record<ReportState, string> = { draft: "Draft", submitted: "Menunggu review", reviewed: "Menunggu persetujuan", approved: "Disetujui", distributed: "Didistribusikan" };

export type ReportAction = "submit" | "review" | "approve" | "return" | "distribute";
export const REPORT_ACTION_LABEL: Record<ReportAction, string> = { submit: "Ajukan review", review: "Selesai direview", approve: "Setujui", return: "Kembalikan", distribute: "Distribusikan" };
const NEXT: Record<ReportAction, ReportState> = { submit: "submitted", review: "reviewed", approve: "approved", return: "draft", distribute: "distributed" };

export interface ReportSubject {
  kind: ReportKind;
  state: ReportState;
  entities: readonly string[];
  preparedBy: string;
  reviewedBy: string | null;
}

const covers = (actor: Actor, entities: readonly string[]) => actor.entities.includes("*") || entities.every((e) => actor.entities.includes(e));
export const canPrepareReport = (actor: Actor, entities: readonly string[]) => actor.role === "finance" && covers(actor, entities);

/** Finance, the Auditor and the Head of FRM follow a report from draft; the Direktur reads it once approved. */
export function canViewReport(actor: Actor, r: Pick<ReportSubject, "state" | "entities">, org: OrgTree): boolean {
  if (!covers(actor, r.entities)) return false;
  if (actor.role === "director") return r.state === "approved" || r.state === "distributed";
  return actor.role === "finance" || actor.role === "auditor" || isCfo(actor, org);
}

export function reportActions(actor: Actor, r: ReportSubject, org: OrgTree): ReportAction[] {
  if (!covers(actor, r.entities)) return [];
  const finance = actor.role === "finance";
  const preparer = actor.userId === r.preparedBy;
  switch (r.state) {
    case "draft":
      return finance && preparer ? ["submit"] : [];
    case "submitted":
      return finance && !preparer ? ["review", "return"] : [];
    case "reviewed":
      return isCfo(actor, org) && !preparer && actor.userId !== r.reviewedBy ? ["approve", "return"] : [];
    case "approved":
      return finance ? ["distribute"] : [];
    case "distributed":
      return [];
  }
}

export function reportStep(actor: Actor, r: ReportSubject, action: ReportAction, note: string, org: OrgTree): { ok: true; to: ReportState } | { ok: false; problem: "forbidden" | "note" } {
  if (!reportActions(actor, r, org).includes(action)) return { ok: false, problem: "forbidden" };
  if (action === "return" && !note.trim()) return { ok: false, problem: "note" };
  return { ok: true, to: NEXT[action] };
}

/** The reports built on the books: they wait for every month to be closed. The others state the day they were made. */
export const FROM_CLOSING: readonly ReportKind[] = ["pnl", "balance", "cashflow", "variance"];

/** The "PT:month" still open for a report that needs closed books. */
export function reportProblem(kind: ReportKind, entities: readonly string[], months: readonly number[], closed: readonly { entity: string; month: number }[]): string[] {
  if (!FROM_CLOSING.includes(kind)) return [];
  return entities.flatMap((e) => months.filter((m) => !closed.some((c) => c.entity === e && c.month === m)).map((m) => `${e}:${m}`));
}
