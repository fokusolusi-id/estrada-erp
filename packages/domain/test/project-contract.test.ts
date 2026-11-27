import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import { canProject } from "../src/project";
import { autoProject, canContract, contractProblem } from "../src/project-contract";
import type { Actor } from "../src/policy";
import type { Role } from "../src/roles";

const org = new OrgTree([{ code: "DIR", parent: null }, { code: "BCD", parent: "DIR" }, { code: "PDMS", parent: "DIR" }, { code: "PMO", parent: "PDMS" }, { code: "FRM", parent: "DIR" }, { code: "FRM-LCM", parent: "FRM" }]);
const who = (role: Role, orgUnit: string, entities = ["*"]): Actor => ({ userId: "u", role, orgUnit, entities });
const project = { entity: "ESTRADA", team: null, status: "Initiation" as const };

describe("contract record (sheet FC04_Projek, BR-PRJ-001, BR-PRJ-003)", () => {
  const ok = { number: "K.TEL.1/2027", date: "2027-02-01", p8On: "2027-01-15", duration: "Januari-Desember", term: "termin" as const, today: "2027-03-01" };
  it("needs number, date, duration and term, after the P8", () => {
    expect(contractProblem(ok)).toBeNull();
    expect(contractProblem({ ...ok, number: " " })).toBe("number");
    expect(contractProblem({ ...ok, date: "" })).toBe("date");
    expect(contractProblem({ ...ok, date: "2027-03-02" })).toBe("date");
    expect(contractProblem({ ...ok, p8On: null })).toBe("p8");
    expect(contractProblem({ ...ok, date: "2027-01-14" })).toBe("order");
    expect(contractProblem({ ...ok, duration: "" })).toBe("duration");
    expect(contractProblem({ ...ok, term: null })).toBe("term");
  });
});

describe("who fills what (client decision: as FC04)", () => {
  it("BCD the P8, Legal the contract, the Head PMO the PICs", () => {
    expect(canContract(who("requestor", "BCD"), "p8", project, org)).toBe(true);
    expect(canContract(who("requestor", "BCD"), "contract", project, org)).toBe(false);
    expect(canContract(who("requestor", "FRM-LCM"), "contract", project, org)).toBe(true);
    expect(canContract(who("requestor", "FRM-LCM", ["MATRIK"]), "contract", project, org)).toBe(false);
    expect(canContract(who("finance", "FRM"), "contract", project, org)).toBe(false);
    expect(canContract(who("default_owner", "PMO"), "pic", project, org)).toBe(true);
    expect(canContract(who("requestor", "PMO"), "pic", project, org)).toBe(false);
  });
  it("lets Legal open the projects it signs", () => expect(canProject(who("requestor", "FRM-LCM"), "view", project, org)).toBe(true));
  it("leaves a dropped or closed project alone", () => {
    expect(canContract(who("requestor", "FRM-LCM"), "contract", { ...project, status: "Closing" }, org)).toBe(false);
  });
});

describe("autoProject (BR-SP-004; client decision: sites asked on the deal)", () => {
  it("opens one when a deal without a project becomes won", () => {
    expect(autoProject({ from: "AK", to: "WB", hasProject: false, sites: 3 })).toEqual({ open: true, sites: 3 });
    expect(autoProject({ from: "AK", to: "WB", hasProject: false, sites: null })).toEqual({ problem: "sites" });
  });
  it("does nothing otherwise", () => {
    for (const v of [{ from: "WB", to: "CW" }, { from: "QO", to: "NG" }] as const) expect(autoProject({ ...v, hasProject: false, sites: null })).toEqual({ open: false });
    expect(autoProject({ from: "AK", to: "WB", hasProject: true, sites: null })).toEqual({ open: false });
  });
});
