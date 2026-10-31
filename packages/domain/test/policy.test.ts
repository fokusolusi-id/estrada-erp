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
    expect(can(admin, "coa.manage", null, org)).toBe(true);
    expect(can(admin, "line.edit", line, org)).toBe(false);
    expect(can(actor({ role: "finance", orgUnit: "FRM" }), "coa.manage", null, org)).toBe(false);
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
