import { describe, expect, it } from "vitest";
import { isParticipant, notificationLink, notificationsFor, SUMMARY_ROLES } from "../src/notifications";

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

describe("notificationLink", () => {
  it("opens the screen where the recipient acts on each handoff", () => {
    expect(notificationLink("submit", ["default_owner"])).toBe("/rka/queue");
    expect(notificationLink("consolidate", ["division_owner"])).toBe("/rka/division");
    expect(notificationLink("approve", ["finance"])).toBe("/rka/review");
    expect(notificationLink("clarify", ["division_owner"])).toBe("/rka/division");
    expect(notificationLink("return", ["requestor"])).toBe("/rka");
  });

  it("sends the lock role to the Kunci RKA screen once the version is final", () => {
    expect(notificationLink("finalize", ["finance"])).toBe("/rka/lock");
    expect(notificationLink("finalize", ["director"])).toBe("/rka/lock");
  });

  it("links the locked notice to the summary only for roles that may open it", () => {
    for (const role of SUMMARY_ROLES) expect(notificationLink("lock", [role])).toBe("/summary");
    expect(notificationLink("lock", ["requestor"])).toBe("/rka");
    expect(notificationLink("lock", ["default_owner"])).toBe("/rka");
  });

  it("uses the summary when a person holds any role that may open it", () => {
    expect(notificationLink("lock", ["requestor", "division_owner"])).toBe("/summary");
    expect(notificationLink("lock", [])).toBe("/rka");
  });
});
