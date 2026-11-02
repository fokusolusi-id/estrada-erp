import { describe, expect, it } from "vitest";
import { daysLeft, deadlineReminderDay, defaultDeadline, isFullyLocked, nextVersionName, openCycleProblem, reviseProblem, waitingTooLong } from "../src/cycle";

describe("nextVersionName: a revision copies a locked version under the next name", () => {
  it("numbers revisions the way Finance names workbook files", () => {
    expect(nextVersionName("RKA 2027", [])).toBe("RKA 2027 v2");
    expect(nextVersionName("RKA 2027 Upd Fin v2", [])).toBe("RKA 2027 Upd Fin v3");
  });

  it("skips names already taken", () => {
    expect(nextVersionName("RKA 2027 Upd Fin v2", ["RKA 2027 Upd Fin v3"])).toBe("RKA 2027 Upd Fin v4");
  });
});

describe("one open version per fiscal year", () => {
  const versions = [
    { fiscalYear: 2027, status: "locked" as const },
    { fiscalYear: 2026, status: "open" as const },
  ];

  it("opens a cycle only when that year has no open version", () => {
    expect(openCycleProblem(2027, versions)).toBeNull();
    expect(openCycleProblem(2026, versions)).toBe("already_open");
  });

  it("revises only a locked version, and only while its year has nothing open", () => {
    expect(reviseProblem({ fiscalYear: 2027, status: "locked" }, versions)).toBeNull();
    expect(reviseProblem({ fiscalYear: 2027, status: "open" }, versions)).toBe("not_locked");
    expect(reviseProblem({ fiscalYear: 2026, status: "locked" }, versions)).toBe("already_open");
  });
});

describe("isFullyLocked: the version locks when its last line does", () => {
  it("needs every line locked, and at least one line", () => {
    expect(isFullyLocked(["locked", "locked"])).toBe(true);
    expect(isFullyLocked(["locked", "awaiting_lock"])).toBe(false);
    expect(isFullyLocked([])).toBe(false);
  });
});

describe("reminders, counted in Jakarta calendar days", () => {
  // Deadline 15 Nov 2026 17:00 WIB (10:00 UTC)
  const deadline = new Date("2026-11-15T10:00:00Z");

  it("counts calendar days left, not 24-hour periods", () => {
    expect(daysLeft(deadline, new Date("2026-11-14T16:30:00Z"))).toBe(1); // 14 Nov 23:30 WIB
    expect(daysLeft(deadline, new Date("2026-11-14T17:30:00Z"))).toBe(0); // 15 Nov 00:30 WIB
  });

  it("reminds requestors 7, 3 and 1 days before the deadline", () => {
    expect(deadlineReminderDay(deadline, new Date("2026-11-08T02:00:00Z"))).toBe(7);
    expect(deadlineReminderDay(deadline, new Date("2026-11-12T02:00:00Z"))).toBe(3);
    expect(deadlineReminderDay(deadline, new Date("2026-11-14T02:00:00Z"))).toBe(1);
    expect(deadlineReminderDay(deadline, new Date("2026-11-10T02:00:00Z"))).toBeNull();
    expect(deadlineReminderDay(deadline, new Date("2026-11-16T02:00:00Z"))).toBeNull();
  });

  it("treats an item as waiting too long after the given number of days", () => {
    const moved = new Date("2026-11-01T03:00:00Z");
    expect(waitingTooLong(moved, new Date("2026-11-03T03:00:00Z"), 3)).toBe(false);
    expect(waitingTooLong(moved, new Date("2026-11-04T03:00:00Z"), 3)).toBe(true);
  });
});

describe("defaultDeadline: RKA is final by the end of the running year (client answer 7)", () => {
  it("proposes 31 December of the year before the fiscal year", () => {
    expect(defaultDeadline(2027)).toBe("2026-12-31");
    expect(defaultDeadline(2028)).toBe("2027-12-31");
  });
});
