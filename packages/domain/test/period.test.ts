import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import { monthOf, periodStep, postingProblem } from "../src/period";
import { can, type Actor, type Permission } from "../src/policy";
import { ROLES, type Role } from "../src/roles";

const rights = { mayClose: true, mayReopen: true, reason: "" };

describe("periodStep (plan A9; P0_Module_Spec MOD-F1)", () => {
  it("closes a month in two steps, and lets closing be called off", () => {
    expect(periodStep("open", "start_closing", rights)).toEqual({ to: "closing" });
    expect(periodStep("closing", "close", rights)).toEqual({ to: "closed" });
    expect(periodStep("closing", "cancel_closing", rights)).toEqual({ to: "open" });
    expect(periodStep("open", "close", rights)).toEqual({ problem: "wrong_state" });
  });
  it("reopens a closed month only with the right and a reason", () => {
    expect(periodStep("closed", "reopen", { ...rights, reason: "Koreksi tanggal bayar" })).toEqual({ to: "open" });
    expect(periodStep("closed", "reopen", rights)).toEqual({ problem: "reason_required" });
    expect(periodStep("closed", "reopen", { ...rights, mayReopen: false, reason: "x" })).toEqual({ problem: "not_allowed" });
    expect(periodStep("closing", "close", { ...rights, mayClose: false })).toEqual({ problem: "not_allowed" });
  });
});

describe("postingProblem: only a closed month refuses (client decision)", () => {
  const periods = [
    { year: 2027, month: 1, status: "closed" as const },
    { year: 2027, month: 2, status: "closing" as const },
  ];
  it("reads the month a date falls in", () => {
    expect(monthOf("2027-01-31")).toEqual({ year: 2027, month: 1 });
    expect(monthOf("31/01/2027")).toBeNull();
  });
  it("refuses a closed month, warns on a closing one, and passes the rest", () => {
    expect(postingProblem("2027-01-15", periods)).toEqual({ blocked: true, year: 2027, month: 1 });
    expect(postingProblem("2027-02-01", periods)).toEqual({ blocked: false, year: 2027, month: 2 });
    expect(postingProblem("2027-03-01", periods)).toBeNull();
    expect(postingProblem("2026-01-15", periods)).toBeNull();
  });
});

describe("who closes and who reopens", () => {
  const org = new OrgTree([{ code: "DIR", parent: null }, { code: "FRM", parent: "DIR" }, { code: "BCD", parent: "DIR" }]);
  const allowed = (p: Permission, unit: string) => ROLES.filter((r: Role) => can({ userId: "u", role: r, orgUnit: unit, entities: ["*"] } as Actor, p, null, org));
  it("Finance and the FRM Division Owner close", () => {
    expect(allowed("period.close", "FRM")).toEqual(["division_owner", "finance"]);
    expect(allowed("period.close", "BCD")).toEqual(["finance"]);
  });
  it("Admin and the FRM Division Owner reopen", () => {
    expect(allowed("period.reopen", "FRM")).toEqual(["division_owner", "admin"]);
    expect(allowed("period.reopen", "BCD")).toEqual(["admin"]);
  });
});
