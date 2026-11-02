import { describe, expect, it } from "vitest";
import { allowedActions, openRemark, transition, type ApprovalState } from "../src/approval";

describe("RKA approval state machine (CARA PENGISIAN point 10)", () => {
  it("runs the happy path Requestor → Default Owner → Division Owner → Finance, and Head Finance locks", () => {
    let s: ApprovalState = "draft";
    s = transition(s, { action: "submit", role: "requestor" }).to;
    expect(s).toBe("consolidation");
    s = transition(s, { action: "consolidate", role: "default_owner" }).to;
    expect(s).toBe("division_approval");
    s = transition(s, { action: "approve", role: "division_owner" }).to;
    expect(s).toBe("finance_review");
    s = transition(s, { action: "finalize", role: "finance" }).to;
    expect(s).toBe("awaiting_lock");
    s = transition(s, { action: "lock", role: "finance" }).to;
    expect(s).toBe("locked");
  });

  it("returns to the requestor only with a comment", () => {
    expect(() => transition("consolidation", { action: "return", role: "default_owner" })).toThrow(/comment/);
    expect(transition("consolidation", { action: "return", role: "default_owner", comment: "Basis kurang" }).to).toBe("draft");
  });

  it("lets Finance ask the Division Owner for clarification with a comment", () => {
    expect(transition("finance_review", { action: "clarify", role: "finance", comment: "Rincian?" }).to).toBe("division_approval");
  });

  it("refuses a role acting out of turn", () => {
    expect(() => transition("draft", { action: "consolidate", role: "default_owner" })).toThrow(/not allowed/);
    expect(() => transition("finance_review", { action: "finalize", role: "division_owner" })).toThrow(/not allowed/);
  });

  it("never edits a locked version", () => {
    expect(allowedActions("locked", "director")).toEqual([]);
    expect(allowedActions("locked", "finance")).toEqual([]);
  });

  it("leaves the lock to Head Finance, not the Director (client answer 3)", () => {
    expect(transition("awaiting_lock", { action: "lock", role: "finance" }).to).toBe("locked");
    expect(() => transition("awaiting_lock", { action: "lock", role: "director" })).toThrow(/not allowed/);
  });

  it("still lets the lock role be configured", () => {
    expect(transition("awaiting_lock", { action: "lock", role: "director" }, { lockRole: "director" }).to).toBe("locked");
  });
});

describe("openRemark: the comment a line is waiting on", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 31, 9, minute));
  it("shows the latest return or clarification while the line still sits where it sent it", () => {
    const events = [
      { action: "submit" as const, toState: "consolidation" as const, comment: null, at: at(1) },
      { action: "return" as const, toState: "draft" as const, comment: "Basis kontrak belum dilampirkan", at: at(2) },
    ];
    expect(openRemark(events, "draft")).toEqual(events[1]);
  });

  it("clears once the line moves on", () => {
    const events = [
      { action: "return" as const, toState: "draft" as const, comment: "Basis?", at: at(2) },
      { action: "submit" as const, toState: "consolidation" as const, comment: null, at: at(3) },
    ];
    expect(openRemark(events, "consolidation")).toBeNull();
  });
});
