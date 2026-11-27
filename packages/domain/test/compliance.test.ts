import { describe, expect, it } from "vitest";
import { COMPLIANCE_ITEMS, complianceList, complianceProblem, complianceSummary } from "../src/compliance";
import { OrgTree } from "../src/org";
import { can, type Actor, type Permission } from "../src/policy";
import { ROLES } from "../src/roles";

describe("the checklist (sheet 06_Compliance, SCR-AUD-03)", () => {
  it("carries the 17 rows, with the three marked Future", () => {
    expect(COMPLIANCE_ITEMS).toHaveLength(17);
    expect(new Set(COMPLIANCE_ITEMS.map((i) => i.code)).size).toBe(17);
    expect(COMPLIANCE_ITEMS.filter((i) => i.initial === "future").map((i) => i.regulation)).toEqual(["ISO 27001 (target)", "ISO 9001 (target)", "Internal Policy: Whistleblowing"]);
  });
  it("shows the sheet's status until someone records one", () => {
    const list = complianceList([{ code: "ppn", status: "implemented", evidenceUrl: "https://x.test/a", note: null }]);
    expect(list.find((i) => i.code === "ppn")).toMatchObject({ status: "implemented", evidenceUrl: "https://x.test/a" });
    expect(list.find((i) => i.code === "pph")).toMatchObject({ status: "to_implement", evidenceUrl: null });
    expect(complianceSummary(list)).toEqual({ to_implement: 13, in_progress: 0, implemented: 1, future: 3 });
  });
  it("takes a web link as evidence", () => {
    expect(complianceProblem({ code: "ppn", evidenceUrl: "" })).toBeNull();
    expect(complianceProblem({ code: "ppn", evidenceUrl: "https://drive.google.com/x" })).toBeNull();
    expect(complianceProblem({ code: "ppn", evidenceUrl: "javascript:alert(1)" })).toBe("link");
    expect(complianceProblem({ code: "ppn", evidenceUrl: "folder bukti" })).toBe("link");
    expect(complianceProblem({ code: "nope", evidenceUrl: "" })).toBe("unknown");
  });
});

describe("who (client decision)", () => {
  const org = new OrgTree([{ code: "FRM", parent: null }]);
  const allowed = (p: Permission) => ROLES.filter((role) => can({ userId: "u", role, orgUnit: "FRM", entities: ["*"] } as Actor, p, null, org));
  it("lets the Head of FRM and the Auditor update; Finance, Direktur and Admin read", () => {
    expect(allowed("compliance.manage")).toEqual(["division_owner", "auditor"]);
    expect(allowed("compliance.view")).toEqual(["division_owner", "finance", "director", "auditor", "admin"]);
  });
});
