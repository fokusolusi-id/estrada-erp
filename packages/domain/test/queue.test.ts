import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import { actionsFor, blockedSeats, handoffs } from "../src/queue";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "PDMS", parent: "DIR" },
  { code: "PMO", parent: "PDMS" },
  { code: "SCM", parent: "PDMS" },
  { code: "HCM", parent: "DIR" },
  { code: "FRM", parent: "DIR" },
]);

const actor = (over: Partial<Actor>): Actor => ({ userId: "u", role: "requestor", orgUnit: "SCM", entities: ["ESTRADA"], ...over });
const line = { requestorUnit: "SCM", ownerUnit: "SCM", entity: "ESTRADA", state: "draft" as const };

describe("actionsFor: what this position may do to this line now", () => {
  it("requestor submits own unit's drafts only", () => {
    expect(actionsFor(actor({}), line, org)).toEqual(["submit"]);
    expect(actionsFor(actor({ orgUnit: "PMO" }), line, org)).toEqual([]);
  });

  it("default owner consolidates or returns lines it owns", () => {
    const l = { ...line, state: "consolidation" as const };
    expect(actionsFor(actor({ role: "default_owner" }), l, org)).toEqual(["return", "consolidate"]);
    expect(actionsFor(actor({ role: "default_owner", orgUnit: "PMO" }), l, org)).toEqual([]);
  });

  it("cross-division line is approved by the budget owner, not the requestor's head", () => {
    // FRM requests training budgeted under HCM (Lintas Divisi = Ya)
    const cross = { ...line, requestorUnit: "FRM", ownerUnit: "HCM", state: "consolidation" as const };
    expect(actionsFor(actor({ role: "default_owner", orgUnit: "HCM" }), cross, org)).toEqual(["return", "consolidate"]);
    expect(actionsFor(actor({ role: "default_owner", orgUnit: "FRM" }), cross, org)).toEqual([]);
  });

  it("division owner approves lines owned anywhere in the division", () => {
    const l = { ...line, state: "division_approval" as const };
    expect(actionsFor(actor({ role: "division_owner", orgUnit: "PDMS" }), l, org)).toEqual(["approve"]);
    expect(actionsFor(actor({ role: "division_owner", orgUnit: "HCM" }), l, org)).toEqual([]);
  });

  it("Finance acts company-wide but only within its entities", () => {
    const l = { ...line, state: "finance_review" as const };
    expect(actionsFor(actor({ role: "finance", orgUnit: "FRM" }), l, org)).toEqual(["clarify", "finalize"]);
    expect(actionsFor(actor({ role: "finance", orgUnit: "FRM", entities: ["MATRIK"] }), l, org)).toEqual([]);
  });

  it("lock follows the configured lock role", () => {
    const l = { ...line, state: "awaiting_lock" as const };
    const fin = actor({ role: "finance", orgUnit: "FRM", entities: ["*"] });
    const dir = actor({ role: "director", orgUnit: "DIR", entities: ["*"] });
    expect(actionsFor(fin, l, org)).toEqual(["lock"]);
    expect(actionsFor(dir, l, org)).toEqual([]);
    expect(actionsFor(dir, l, org, { lockRole: "director" })).toEqual(["lock"]);
  });

  it("auditor and admin never act", () => {
    for (const role of ["auditor", "admin"] as const) {
      for (const state of ["draft", "consolidation", "finance_review", "awaiting_lock"] as const) {
        expect(actionsFor(actor({ role, orgUnit: "DIR", entities: ["*"] }), { ...line, state }, org)).toEqual([]);
      }
    }
  });
});

describe("handoffs: one email per recipient unit, never one per line", () => {
  it("groups moved lines by owner unit with a count", () => {
    const moved = [
      { ownerUnit: "SCM", createdBy: "a" },
      { ownerUnit: "SCM", createdBy: "b" },
      { ownerUnit: "PMO", createdBy: "a" },
    ];
    expect(handoffs(moved)).toEqual([
      { ownerUnit: "SCM", count: 2, requestors: ["a", "b"] },
      { ownerUnit: "PMO", count: 1, requestors: ["a"] },
    ]);
  });
});

describe("blockedSeats: vacant seats holding RKA lines up, for Admin to fill with a pjs", () => {
  const positions = [
    { orgUnit: "SCM", role: "default_owner" as const, holder: "u-scm", acting: null },
    { orgUnit: "PMO", role: "default_owner" as const, holder: null, acting: null },
    { orgUnit: "PDMS", role: "division_owner" as const, holder: null, acting: "u-pjs" },
  ];
  const at = (ownerUnit: string, state: "consolidation" | "division_approval" | "draft") => ({ ownerUnit, state });

  it("lists a vacant seat and a missing seat with the lines they hold", () => {
    const lines = [at("PMO", "consolidation"), at("PMO", "consolidation"), at("FRM", "consolidation"), at("SCM", "consolidation")];
    expect(blockedSeats(lines, positions, org)).toEqual([
      { unit: "PMO", role: "default_owner", exists: true, count: 2 },
      { unit: "FRM", role: "default_owner", exists: false, count: 1 },
    ]);
  });

  it("treats a seat with a pjs as filled, and ignores lines nobody approves yet", () => {
    expect(blockedSeats([at("SCM", "division_approval"), at("PMO", "draft")], positions, org)).toEqual([]);
  });
});
