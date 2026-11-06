import { describe, expect, it } from "vitest";
import { can, type Actor } from "../src/policy";
import { OrgTree, seatFor } from "../src/org";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "PDMS", parent: "DIR" },
  { code: "PMO", parent: "PDMS" },
  { code: "SCM", parent: "PDMS" },
  { code: "BCD", parent: "DIR" },
  { code: "FRM", parent: "DIR" },
]);

const actor = (over: Partial<Actor>): Actor => ({
  userId: "u",
  role: "requestor",
  orgUnit: "SCM",
  entities: ["ESTRADA"],
  ...over,
});

const line = { requestorUnit: "SCM", ownerUnit: "SCM", entity: "ESTRADA", state: "draft" as const };

describe("policy", () => {
  it("requestor edits own unit's draft lines only", () => {
    expect(can(actor({}), "line.edit", line, org)).toBe(true);
    expect(can(actor({ orgUnit: "PMO" }), "line.edit", line, org)).toBe(false);
    expect(can(actor({}), "line.edit", { ...line, state: "consolidation" }, org)).toBe(false);
  });

  it("division owner sees every unit in the division subtree", () => {
    expect(can(actor({ role: "division_owner", orgUnit: "PDMS" }), "line.view", line, org)).toBe(true);
    expect(can(actor({ role: "division_owner", orgUnit: "BCD" }), "line.view", line, org)).toBe(false);
  });

  it("entity scope: a MATRIK-only Finance user cannot see ESTRADA lines", () => {
    const fin = actor({ role: "finance", orgUnit: "FRM", entities: ["MATRIK"] });
    expect(can(fin, "line.view", line, org)).toBe(false);
    expect(can(fin, "line.view", { ...line, entity: "MATRIK" }, org)).toBe(true);
  });

  it("cross-division line is visible to requestor and budget owner units", () => {
    const cross = { ...line, requestorUnit: "FRM", ownerUnit: "SCM" };
    expect(can(actor({ orgUnit: "FRM" }), "line.view", cross, org)).toBe(true);
    expect(can(actor({ orgUnit: "SCM" }), "line.view", cross, org)).toBe(true);
  });

  it("auditor reads everything and edits nothing", () => {
    const aud = actor({ role: "auditor", orgUnit: "FRM", entities: ["*"] });
    expect(can(aud, "line.view", line, org)).toBe(true);
    expect(can(aud, "line.edit", line, org)).toBe(false);
  });

  it("admin manages master data but never edits budget lines", () => {
    const admin = actor({ role: "admin", orgUnit: "FRM", entities: ["*"] });
    expect(can(admin, "org.manage", null, org)).toBe(true);
    expect(can(admin, "line.edit", line, org)).toBe(false);
  });

  it("leaves COA Master to Finance alone (client: only Finance adds, edits or deactivates COA)", () => {
    expect(can(actor({ role: "finance", orgUnit: "FRM", entities: ["*"] }), "coa.manage", null, org)).toBe(true);
    for (const role of ["admin", "director", "division_owner", "default_owner", "requestor", "auditor"] as const) {
      expect(can(actor({ role, orgUnit: "FRM", entities: ["*"] }), "coa.manage", null, org)).toBe(false);
    }
  });
});

describe("cycle.manage: opening a cycle, its deadline and revisions", () => {
  it("belongs to Finance only", () => {
    expect(can(actor({ role: "finance", orgUnit: "FRM", entities: ["*"] }), "cycle.manage", null, org)).toBe(true);
    for (const role of ["requestor", "default_owner", "division_owner", "director", "auditor", "admin"] as const) {
      expect(can(actor({ role, orgUnit: "DIR", entities: ["*"] }), "cycle.manage", null, org)).toBe(false);
    }
  });
});

describe("vacant and acting positions: Admin assigns a pjs, nobody is escalated", () => {
  const positions = [
    { orgUnit: "SCM", role: "default_owner" as const, holder: null, acting: null },
    { orgUnit: "PDMS", role: "division_owner" as const, holder: "u-pdms", acting: null },
    { orgUnit: "PMO", role: "default_owner" as const, holder: null, acting: "u-pjs" },
    { orgUnit: "BCD", role: "division_owner" as const, holder: "u-bcd", acting: "u-other" },
  ];

  it("routes to the acting holder (pjs) when the head is vacant", () => {
    expect(seatFor("PMO", "default_owner", positions, org)).toEqual({ unit: "PMO", exists: true, holder: "u-pjs", acting: true });
  });

  it("prefers the holder over an acting holder", () => {
    expect(seatFor("BCD", "division_owner", positions, org)).toEqual({ unit: "BCD", exists: true, holder: "u-bcd", acting: false });
  });

  it("reports a vacant seat instead of escalating to the division head", () => {
    expect(seatFor("SCM", "default_owner", positions, org)).toEqual({ unit: "SCM", exists: true, holder: null, acting: false });
  });

  it("finds the division seat from a department below it", () => {
    expect(seatFor("SCM", "division_owner", positions, org)).toEqual({ unit: "PDMS", exists: true, holder: "u-pdms", acting: false });
  });

  it("reports a missing seat at the owner unit when no position exists up the tree", () => {
    // FRM owns training and bank interest lines but has no Default Owner position yet.
    expect(seatFor("FRM", "default_owner", positions, org)).toEqual({ unit: "FRM", exists: false, holder: null, acting: false });
  });
});

describe("actual.edit: Realisasi 2026 typed in by hand for now (client answer 1)", () => {
  const fin = actor({ role: "finance", orgUnit: "FRM", entities: ["*"] });

  it("belongs to Finance, at any stage: an actual is a reference figure beside the plan, not the plan itself", () => {
    for (const state of ["draft", "finance_review", "locked"] as const) {
      expect(can(fin, "actual.edit", { ...line, state }, org)).toBe(true);
    }
  });

  it("stays within Finance's entities, and no one else may enter it", () => {
    expect(can(actor({ role: "finance", orgUnit: "FRM", entities: ["MATRIK"] }), "actual.edit", line, org)).toBe(false);
    for (const role of ["requestor", "default_owner", "division_owner", "director", "auditor", "admin"] as const) {
      expect(can(actor({ role, orgUnit: "SCM", entities: ["*"] }), "actual.edit", line, org)).toBe(false);
    }
    expect(can(fin, "actual.edit", null, org)).toBe(false);
  });
});

describe("allocation.manage: Finance marks shared costs and their basis (client decision)", () => {
  const fin = actor({ role: "finance", orgUnit: "FRM", entities: ["*"] });

  it("belongs to Finance at any stage before the lock: allocation only changes reports, and the final RKA stays as locked", () => {
    for (const state of ["draft", "consolidation", "finance_review", "awaiting_lock"] as const) {
      expect(can(fin, "allocation.manage", { ...line, state }, org)).toBe(true);
    }
    expect(can(fin, "allocation.manage", { ...line, state: "locked" }, org)).toBe(false);
  });

  it("stays within Finance's entities, and no one else may set it", () => {
    expect(can(actor({ role: "finance", orgUnit: "FRM", entities: ["MATRIK"] }), "allocation.manage", line, org)).toBe(false);
    for (const role of ["requestor", "default_owner", "division_owner", "director", "auditor", "admin"] as const) {
      expect(can(actor({ role, orgUnit: "SCM", entities: ["*"] }), "allocation.manage", line, org)).toBe(false);
    }
    expect(can(fin, "allocation.manage", null, org)).toBe(false);
  });
});
