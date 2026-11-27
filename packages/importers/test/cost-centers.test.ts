import { describe, expect, it } from "vitest";
import { parseCostCenters, parseOrganisationLevels } from "../src/index";

const HEADER = ["Cost Center ID", "Divisi", "Department Head", "Function Group", "Approval Limit (Rp)", "Status"];

describe("parseCostCenters (33_Master_CostCenter)", () => {
  it("reads the cost center rows and stops before the expense categories below them", () => {
    const rows = [["MASTER DATA"], HEADER, ["CC-004", "SCM & Procurement", "Head SCM", "Delivery", 2000000000, "Active"], [], ["EXPENSE CATEGORY (Reference)"], ["CAT-01", "Salary", "OpEx"]];
    expect(parseCostCenters(rows)).toEqual([{ code: "CC-004", name: "SCM & Procurement", functionGroup: "Delivery", approvalLimit: "2000000000.00" }]);
  });
  it("stops on an unknown function group or a limit it cannot read", () => {
    expect(() => parseCostCenters([HEADER, ["CC-001", "Sales", "", "Selling", 1, "Active"]])).toThrow("CC-001");
    expect(() => parseCostCenters([HEADER, ["CC-001", "Sales", "", "Revenue", "", "Active"]])).toThrow("CC-001");
  });
});

describe("parseOrganisationLevels (M Organisasi)", () => {
  it("reads the level and job of each row", () => {
    const rows = [["No", "ID_Perusahaan", "NIP", "Nama", "Level", "Jabatan", "Divisi / Coscenter"], ["4", "ESTRADA", "E20150009", "Rini Andriani", "Level 4", "Business Finance & Pricing", "Finance & Risk Management"]];
    expect(parseOrganisationLevels(rows)).toEqual([{ name: "Rini Andriani", level: 4, job: "Business Finance & Pricing" }]);
  });
});
