import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import { can, type Actor, type Permission } from "../src/policy";
import { ROLES, type Role } from "../src/roles";
import { nextMasterId } from "../src/partner";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "BCD", parent: "DIR" },
  { code: "BCD-TEL", parent: "BCD" },
  { code: "PDMS", parent: "DIR" },
  { code: "SCM", parent: "PDMS" },
  { code: "HCM", parent: "DIR" },
  { code: "FRM", parent: "DIR" },
]);
const actor = (role: Role, orgUnit: string): Actor => ({ userId: "u", role, orgUnit, entities: ["*"] });
const allowed = (permission: Permission, unit: string) => ROLES.filter((r) => can(actor(r, unit), permission, null, org));
const STAFF = ["requestor", "default_owner", "division_owner"];

describe("master stewards (05_SoD_Matrix: Data Steward MD per master)", () => {
  it("Sales (BCD) keeps Master Customer, and Admin may edit it too", () => {
    expect(allowed("customer.manage", "BCD")).toEqual([...STAFF, "admin"]);
    expect(allowed("customer.manage", "BCD-TEL")).toEqual([...STAFF, "admin"]);
    for (const unit of ["SCM", "HCM", "FRM", "PDMS", "DIR"]) expect(allowed("customer.manage", unit)).toEqual(["admin"]);
  });

  it("SCM keeps Master Mitra and Produk Mitra, not the rest of PDMS; Admin too", () => {
    expect(allowed("partner.manage", "SCM")).toEqual([...STAFF, "admin"]);
    for (const unit of ["BCD", "HCM", "FRM", "PDMS", "DIR"]) expect(allowed("partner.manage", unit)).toEqual(["admin"]);
  });

  it("only Finance keeps COA", () => {
    expect(allowed("coa.manage", "FRM")).toEqual(["finance"]);
  });

  it("employees are kept in the app by HCM and Admin", () => {
    expect(allowed("employee.manage", "HCM")).toEqual([...STAFF, "admin"]);
    expect(allowed("employee.manage", "BCD")).toEqual(["admin"]);
  });

  it("20_Navigation_IA: employee data is read by HCM, Direktur and Auditor, and Admin who keeps it", () => {
    expect(allowed("employee.view", "HCM")).toEqual([...STAFF, "director", "auditor", "admin"]);
    expect(allowed("employee.view", "BCD")).toEqual(["director", "auditor", "admin"]);
  });
});

describe("nextMasterId", () => {
  it("continues the sheet's numbering", () => {
    expect(nextMasterId("Cust", ["Cust-001", "Cust-012"])).toBe("Cust-013");
    expect(nextMasterId("Mitra", ["Mitra-008"])).toBe("Mitra-009");
    expect(nextMasterId("Cust", [])).toBe("Cust-001");
  });
});
