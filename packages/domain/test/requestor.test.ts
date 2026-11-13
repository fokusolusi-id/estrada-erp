import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import { duplicateOf, requestedWithin, requestorOverview } from "../src/requestor";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "PDMS", parent: "DIR" },
  { code: "SCM", parent: "PDMS" },
  { code: "HCM", parent: "DIR" },
]);

describe("requestedWithin", () => {
  it("keeps the lines the requestor's own unit asked for", () => {
    expect(requestedWithin("SCM", org)({ requestorUnit: "SCM" })).toBe(true);
    expect(requestedWithin("PDMS", org)({ requestorUnit: "SCM" })).toBe(true);
  });

  it("drops another unit's request, even when this unit owns the budget", () => {
    expect(requestedWithin("HCM", org)({ requestorUnit: "SCM" })).toBe(false);
  });
});

describe("duplicateOf", () => {
  const saved = [{ id: "a", requestorUnit: "SCM", coaCode: "6241", entity: "ESTRADA", ownerUnit: "SCM" }];
  const line = { requestorUnit: "SCM", coaCode: "6241", entity: "ESTRADA", ownerUnit: "SCM" };

  it("finds the same COA already entered for the same entity and owner", () => {
    expect(duplicateOf(line, saved)?.id).toBe("a");
  });

  it("allows the same COA for another entity or another owner", () => {
    expect(duplicateOf({ ...line, entity: "MATRIK" }, saved)).toBeNull();
    expect(duplicateOf({ ...line, ownerUnit: "HCM" }, saved)).toBeNull();
  });

  it("allows another requesting unit to ask for the same COA", () => {
    expect(duplicateOf({ ...line, requestorUnit: "HCM" }, saved)).toBeNull();
  });

  it("does not match the line against itself", () => {
    expect(duplicateOf({ ...line, id: "a" }, saved)).toBeNull();
  });

  it("leaves headcount plan lines out: several positions share one salary COA", () => {
    expect(duplicateOf(line, [{ ...saved[0]!, planned: true }])).toBeNull();
  });
});

describe("requestorOverview", () => {
  const lines = [
    { state: "draft" as const, returned: true, commentCount: 2 },
    { state: "draft" as const, returned: false, commentCount: 0 },
    { state: "consolidation" as const, returned: false, commentCount: 1 },
    { state: "consolidation" as const, returned: false, commentCount: 0 },
    { state: "finance_review" as const, returned: false, commentCount: 0 },
    { state: "locked" as const, returned: false, commentCount: 0 },
  ];

  it("counts what has been sent and where it sits, stage by stage", () => {
    const o = requestorOverview(lines);
    expect(o.submitted).toBe(4);
    expect(o.positions).toEqual([
      { state: "consolidation", count: 2 },
      { state: "division_approval", count: 0 },
      { state: "finance_review", count: 1 },
      { state: "awaiting_lock", count: 0 },
      { state: "locked", count: 1 },
    ]);
  });

  it("counts drafts, lines sent back for changes and lines under discussion", () => {
    const o = requestorOverview(lines);
    expect(o.drafts).toBe(2);
    expect(o.returned).toBe(1);
    expect(o.discussed).toBe(2);
  });
});
