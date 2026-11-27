import { describe, expect, it } from "vitest";
import { COST_CENTER_UNITS, functionCodeFor, organisationUnitFor, parseFunctionCodes } from "../src/cost-center";
import { OrgTree } from "../src/org";
import { can, type Actor, type Permission } from "../src/policy";
import { ROLES, type Role } from "../src/roles";

const org = new OrgTree([{ code: "DIR", parent: null }, { code: "FRM", parent: "DIR" }]);
const allowed = (p: Permission) => ROLES.filter((r: Role) => can({ userId: "u", role: r, orgUnit: "FRM", entities: ["*"] } as Actor, p, null, org));

describe("cost center = org unit (33_Master_CostCenter, plan decision 5)", () => {
  it("maps the sheet's codes to units, leaving CC-008 unmapped (no IT unit; client decision)", () => {
    expect(COST_CENTER_UNITS).toEqual({
      "CC-001": "BCD", "CC-002": "PST", "CC-003": "PMO", "CC-004": "SCM", "CC-005": "ISO", "CC-006": "FRM",
      "CC-007": "HCM", "CC-009": "FRM-LCM", "CC-010": "BCD-MKT", "CC-011": "FRM-RCI", "CC-012": "DIR",
    });
  });
  it("lets Finance and Admin change limits, and Direktur and Auditor read them", () => {
    expect(allowed("costcenter.manage")).toEqual(["finance", "admin"]);
    expect(allowed("costcenter.view")).toEqual(["finance", "director", "auditor", "admin"]);
  });
});

describe("function codes and levels (07_Org_Chart, M Organisasi; BR-MD-007)", () => {
  it("reads F0–F6, including Matrik's joined codes", () => {
    expect(parseFunctionCodes("F5")).toEqual(["F5"]);
    expect(parseFunctionCodes(" f1&f2, F6-GEN2 ")).toEqual(["F1", "F2", "F6"]);
    expect(parseFunctionCodes("")).toEqual([]);
    expect(parseFunctionCodes("F9")).toBeNull();
  });
  it("tags only the units a function clearly is", () => {
    expect(["FRM", "FRM-FIN-BFP", "FRM-LCM", "HCM", "SCM-WHL"].map(functionCodeFor)).toEqual(["F5", "F5", "F5", "F0", "F3"]);
    expect(["BCD", "PMO", "PST"].map(functionCodeFor)).toEqual([null, null, null]);
  });
  it("places only the M Organisasi jobs that name one unit", () => {
    expect(organisationUnitFor("Head Finance & Risk Management")).toBe("FRM");
    expect(organisationUnitFor("Cash Mngmnt & Treasury")).toBe("FRM-FIN-TCM");
    expect(organisationUnitFor("Direktur")).toBe("DIR");
    expect(organisationUnitFor("Head Business Development")).toBeNull();
  });
});
