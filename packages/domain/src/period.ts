/** Fiscal period per PT and month (plan A9, sheet P0_Module_Spec MOD-F1). A month with no record is open. */

export const PERIOD_STATUSES = ["open", "closing", "closed"] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];
export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = { open: "Terbuka", closing: "Penutupan", closed: "Ditutup" };

export const PERIOD_ACTIONS = ["start_closing", "cancel_closing", "close", "reopen"] as const;
export type PeriodAction = (typeof PERIOD_ACTIONS)[number];
export const PERIOD_ACTION_LABEL: Record<PeriodAction, string> = { start_closing: "Mulai penutupan", cancel_closing: "Batalkan penutupan", close: "Tutup", reopen: "Buka kembali" };

const STEPS: Record<PeriodAction, { from: PeriodStatus; to: PeriodStatus }> = {
  start_closing: { from: "open", to: "closing" },
  cancel_closing: { from: "closing", to: "open" },
  close: { from: "closing", to: "closed" },
  reopen: { from: "closed", to: "open" },
};
export const periodActions = (status: PeriodStatus): PeriodAction[] => PERIOD_ACTIONS.filter((a) => STEPS[a].from === status);

export type PeriodProblem = "wrong_state" | "not_allowed" | "reason_required";

/** Reopening has its own right and always a reason; the other steps belong to whoever closes. */
export function periodStep(from: PeriodStatus, action: PeriodAction, ctx: { mayClose: boolean; mayReopen: boolean; reason: string }): { to: PeriodStatus } | { problem: PeriodProblem } {
  if (!(action === "reopen" ? ctx.mayReopen : ctx.mayClose)) return { problem: "not_allowed" };
  if (STEPS[action].from !== from) return { problem: "wrong_state" };
  if (action === "reopen" && !ctx.reason.trim()) return { problem: "reason_required" };
  return { to: STEPS[action].to };
}

export function monthOf(date: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}

/** What a posting on this date runs into: refused in a closed month, only warned while it is closing. */
export function postingProblem(date: string, periods: readonly { year: number; month: number; status: PeriodStatus }[]): { blocked: boolean; year: number; month: number } | null {
  const at = monthOf(date);
  const period = at && periods.find((p) => p.year === at.year && p.month === at.month);
  return !period || period.status === "open" ? null : { blocked: period.status === "closed", year: period.year, month: period.month };
}
