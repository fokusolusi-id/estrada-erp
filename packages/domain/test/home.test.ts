import { describe, expect, it } from "vitest";
import { entityScopeLabel, groupActivity, pendingByStage, type ApprovalState } from "../src";

describe("pendingByStage", () => {
  it("says how many lines each seat still holds, in cycle order, leaving out final ones", () => {
    const states: ApprovalState[] = ["finance_review", "draft", "draft", "awaiting_lock", "locked"];
    expect(pendingByStage(states.map((state, i) => ({ state, ownerUnit: i === 2 ? "HCM" : "SCM" })), (u) => u)).toEqual([
      { state: "draft", role: "requestor", count: 2, divisions: [{ division: "HCM", count: 1 }, { division: "SCM", count: 1 }] },
      { state: "finance_review", role: "finance", count: 1, divisions: [{ division: "SCM", count: 1 }] },
    ]);
  });
});

describe("groupActivity", () => {
  const event = (lineId: string, at: string, actorName = "Rina", action: "submit" | "return" = "submit") => ({ lineId, at, actorName, action });

  it("folds one handoff of many lines into one entry, newest first", () => {
    const groups = groupActivity([
      event("a", "2026-11-01T02:00:05.000Z"),
      event("c", "2026-11-02T03:00:00.000Z", "Budi", "return"),
      event("b", "2026-11-01T02:00:40.000Z"),
    ]);
    expect(groups.map((g) => [g.actorName, g.action, g.events.map((e) => e.lineId)])).toEqual([
      ["Budi", "return", ["c"]],
      ["Rina", "submit", ["b", "a"]],
    ]);
    expect(groups[1]!.at).toBe("2026-11-01T02:00:40.000Z");
  });

  it("keeps separate handoffs apart", () => {
    expect(groupActivity([event("a", "2026-11-01T02:00:00.000Z"), event("b", "2026-11-01T05:00:00.000Z")])).toHaveLength(2);
  });
});

describe("entityScopeLabel", () => {
  it("never shows the raw wildcard", () => {
    expect(entityScopeLabel(["*"])).toBe("Semua entitas");
    expect(entityScopeLabel(["ESTRADA", "MATRIK"])).toBe("Entitas: ESTRADA, MATRIK");
  });
});
