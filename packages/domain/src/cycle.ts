import type { ApprovalState } from "./approval";

export type VersionStatus = "open" | "locked" | "archived";

/** "RKA 2027" → "RKA 2027 v2"; "RKA 2027 Upd Fin v2" → "… v3", skipping names already taken. */
export function nextVersionName(base: string, taken: readonly string[]): string {
  const m = base.match(/^(.*) v(\d+)$/);
  const stem = m ? m[1]! : base;
  let n = m ? Number(m[2]) + 1 : 2;
  while (taken.includes(`${stem} v${n}`)) n += 1;
  return `${stem} v${n}`;
}

type V = { fiscalYear: number; status: VersionStatus };

/** One open version per fiscal year: every screen works on that one. */
export function openCycleProblem(fiscalYear: number, versions: readonly V[]): "already_open" | null {
  return versions.some((v) => v.fiscalYear === fiscalYear && v.status === "open") ? "already_open" : null;
}

/** A locked version is never edited; a revision copies it into a new open version. */
export function reviseProblem(version: V, versions: readonly V[]): "not_locked" | "already_open" | null {
  if (version.status !== "locked") return "not_locked";
  return openCycleProblem(version.fiscalYear, versions);
}

/** The version locks when its last line does. */
export function isFullyLocked(states: readonly ApprovalState[]): boolean {
  return states.length > 0 && states.every((s) => s === "locked");
}

const DAY = 86_400_000;
const WIB = 7 * 3_600_000;
const jakartaDay = (d: Date) => Math.floor((d.getTime() + WIB) / DAY);

/** Calendar days until the deadline in Jakarta time (0 on the deadline's own day). */
export function daysLeft(deadline: Date, now: Date): number {
  return jakartaDay(deadline) - jakartaDay(now);
}

export const DEADLINE_REMINDER_DAYS = [7, 3, 1] as const;

/** The reminder due today for requestors with unsubmitted lines, if any. */
export function deadlineReminderDay(deadline: Date, now: Date): number | null {
  const left = daysLeft(deadline, now);
  return (DEADLINE_REMINDER_DAYS as readonly number[]).includes(left) ? left : null;
}

/** An item waiting this many days or more gets a reminder to whoever holds it. */
export function waitingTooLong(lastMoved: Date, now: Date, days: number): boolean {
  return now.getTime() - lastMoved.getTime() >= days * DAY;
}

/** The deadline a new cycle starts with: RKA must be final by 31 December of the running year (client answer 7). */
export function defaultDeadline(fiscalYear: number): string {
  return `${fiscalYear - 1}-12-31`;
}
