import { describe, expect, it } from "vitest";
import { isParticipant, notificationsFor } from "../src/notifications";

describe("email notifications", () => {
  it("emails the next role on each forward handoff", () => {
    expect(notificationsFor({ action: "submit", from: "draft", to: "consolidation" })).toEqual([
      { template: "lines_submitted", to: "default_owner" },
    ]);
    expect(notificationsFor({ action: "finalize", from: "finance_review", to: "awaiting_lock" })).toEqual([
      { template: "ready_to_lock", to: "lock_role" },
    ]);
  });

  it("emails the person it goes back to on a return, with the comment", () => {
    expect(notificationsFor({ action: "return", from: "consolidation", to: "draft", comment: "Basis kurang" })).toEqual([
      { template: "returned", to: "requestor", comment: "Basis kurang" },
    ]);
  });

  it("announces a lock to all owners and requestors", () => {
    expect(notificationsFor({ action: "lock", from: "awaiting_lock", to: "locked" })).toEqual([
      { template: "rka_locked", to: "all_participants" },
    ]);
  });

  it("sends the lock notice to owners and requestors, not to Admin or Auditor", () => {
    expect(["requestor", "default_owner", "division_owner", "finance", "director"].every((r) => isParticipant(r as never))).toBe(true);
    expect(isParticipant("admin")).toBe(false);
    expect(isParticipant("auditor")).toBe(false);
  });
});
