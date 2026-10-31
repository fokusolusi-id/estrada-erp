import { describe, expect, it } from "vitest";
import { commentAudience, commentEmailDue, commentProblem } from "../src/comments";
import { OrgTree } from "../src/org";
import { can, type Actor } from "../src/policy";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "PDMS", parent: "DIR" },
  { code: "SCM", parent: "PDMS" },
  { code: "FRM", parent: "DIR" },
]);
const actor = (over: Partial<Actor>): Actor => ({ userId: "u", role: "requestor", orgUnit: "SCM", entities: ["ESTRADA"], ...over });
const res = { requestorUnit: "SCM", ownerUnit: "SCM", entity: "ESTRADA", state: "finance_review" as const };

describe("line.comment", () => {
  it("lets everyone in the cycle who can see the line comment on it", () => {
    for (const a of [actor({}), actor({ role: "default_owner" }), actor({ role: "division_owner", orgUnit: "PDMS" }), actor({ role: "finance", orgUnit: "FRM" }), actor({ role: "director", orgUnit: "DIR" })]) {
      expect(can(a, "line.comment", res, org)).toBe(true);
    }
  });

  it("keeps Auditor and Admin read-only, and stays out of other units and entities", () => {
    expect(can(actor({ role: "auditor", orgUnit: "DIR", entities: ["*"] }), "line.comment", res, org)).toBe(false);
    expect(can(actor({ role: "admin", orgUnit: "DIR", entities: ["*"] }), "line.comment", res, org)).toBe(false);
    expect(can(actor({ orgUnit: "FRM" }), "line.comment", res, org)).toBe(false);
    expect(can(actor({ role: "finance", orgUnit: "FRM", entities: ["MATRIK"] }), "line.comment", res, org)).toBe(false);
  });

  it("closes the thread once the line is locked", () => {
    expect(can(actor({ role: "finance", orgUnit: "FRM" }), "line.comment", { ...res, state: "locked" }, org)).toBe(false);
  });
});

describe("commentProblem", () => {
  it("needs some text, and not a wall of it", () => {
    expect(commentProblem("  ")).toBe("empty");
    expect(commentProblem("x".repeat(2001))).toBe("too_long");
    expect(commentProblem("Dasar tarif bandwidth naik 10%?")).toBeNull();
  });
});

describe("commentAudience", () => {
  const line = { state: "finance_review" as const, requestorUnit: "SCM", ownerUnit: "SCM", createdBy: "rina" };
  const cfg = { lockRole: "director" as const };

  it("reaches the requestor, whoever holds the line now, and everyone already in the thread", () => {
    expect(commentAudience(line, ["budi", "rina"], cfg)).toEqual([
      { kind: "user", userId: "rina" },
      { kind: "role", role: "finance" },
      { kind: "user", userId: "budi" },
    ]);
  });

  it("finds the holder's seat in the owner unit while the line is with the division", () => {
    expect(commentAudience({ ...line, state: "consolidation" }, [], cfg)).toEqual([{ kind: "user", userId: "rina" }, { kind: "seat", role: "default_owner", unit: "SCM" }]);
    expect(commentAudience({ ...line, state: "division_approval" }, [], cfg)).toContainEqual({ kind: "seat", role: "division_owner", unit: "SCM" });
    expect(commentAudience({ ...line, state: "awaiting_lock" }, [], { lockRole: "finance" })).toContainEqual({ kind: "role", role: "finance" });
  });

  it("does not repeat the requestor when the draft is still theirs", () => {
    expect(commentAudience({ ...line, state: "draft" }, ["rina"], cfg)).toEqual([{ kind: "user", userId: "rina" }]);
  });

  it("reaches the requesting unit's requestor seat on imported lines that have no creator", () => {
    expect(commentAudience({ ...line, createdBy: null }, [], cfg)).toEqual([{ kind: "seat", role: "requestor", unit: "SCM" }, { kind: "role", role: "finance" }]);
    expect(commentAudience({ ...line, state: "draft", createdBy: null }, [], cfg)).toEqual([{ kind: "seat", role: "requestor", unit: "SCM" }]);
  });
});

describe("commentEmailDue", () => {
  const now = new Date("2026-11-02T03:00:00Z");
  it("sends at most one comment email per person per hour; the rest wait in the thread", () => {
    expect(commentEmailDue(null, now)).toBe(true);
    expect(commentEmailDue(new Date("2026-11-02T02:30:00Z"), now)).toBe(false);
    expect(commentEmailDue(new Date("2026-11-02T01:59:00Z"), now)).toBe(true);
    expect(commentEmailDue(new Date("2026-11-02T02:30:00Z"), now, 20)).toBe(true);
  });
});
