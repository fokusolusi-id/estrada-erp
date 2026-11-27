import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import { REPORT_KINDS, canPrepareReport, canViewReport, periodLabel, reportActions, reportMonths, reportProblem, reportStep } from "../src/report";

const org = new OrgTree([{ code: "FRM", parent: null }]);
const actor = (userId: string, role: Actor["role"], entities = ["*"], orgUnit = "FRM"): Actor => ({ userId, role, orgUnit, entities });
const preparer = actor("a", "finance");
const reviewer = actor("b", "finance");
const head = actor("h", "division_owner");
const report = (state: "draft" | "reviewed" | "submitted" | "approved" | "distributed", over: Partial<{ preparedBy: string; reviewedBy: string | null; entities: string[]; kind: (typeof REPORT_KINDS)[number] }> = {}) => ({
  state, preparedBy: "a", reviewedBy: "b" as string | null, entities: ["ESTRADA"], kind: "pnl" as (typeof REPORT_KINDS)[number], ...over,
});

describe("periods (FC09 step 1)", () => {
  it("covers a month, quarter, semester or year", () => {
    expect([reportMonths("month", 5), reportMonths("quarter", 2), reportMonths("semester", 2), reportMonths("year", 1).length]).toEqual([[5], [4, 5, 6], [7, 8, 9, 10, 11, 12], 12]);
    expect(reportMonths("quarter", 5)).toEqual([]);
  });
  it("names the period", () => {
    expect([periodLabel("month", 5, 2027), periodLabel("quarter", 2, 2027), periodLabel("semester", 1, 2027), periodLabel("year", 1, 2027)]).toEqual(["Mei 2027", "Triwulan II 2027", "Semester I 2027", "Tahun 2027"]);
  });
  it("has the eight report types", () => expect(REPORT_KINDS).toHaveLength(8));
});

describe("access", () => {
  it("is prepared by Finance covering every company in it", () => {
    expect([canPrepareReport(preparer, ["ESTRADA"]), canPrepareReport(actor("c", "finance", ["PAS"]), ["ESTRADA"]), canPrepareReport(head, ["ESTRADA"])]).toEqual([true, false, false]);
  });
  it("shows the Direktur only approved reports of their companies", () => {
    const boss = actor("d", "director", ["ESTRADA"], "DIR");
    expect([canViewReport(boss, report("approved"), org), canViewReport(boss, report("reviewed"), org), canViewReport(boss, report("approved", { entities: ["ESTRADA", "PAS"] }), org)]).toEqual([true, false, false]);
    expect(canViewReport(actor("x", "auditor"), report("draft"), org)).toBe(true);
    expect(canViewReport(actor("r", "requestor"), report("approved"), org)).toBe(false);
  });
});

describe("approval (FC09 steps 3-6; SoD preparer != reviewer != approver)", () => {
  it("is submitted by its preparer, reviewed by another Finance user, approved by the Head of FRM", () => {
    expect(reportActions(preparer, report("draft"), org)).toEqual(["submit"]);
    expect(reportActions(reviewer, report("draft"), org)).toEqual([]);
    expect(reportActions(preparer, report("submitted"), org)).toEqual([]);
    expect(reportActions(reviewer, report("submitted"), org)).toEqual(["review", "return"]);
    expect(reportActions(head, report("reviewed"), org)).toEqual(["approve", "return"]);
    expect(reportActions(actor("a", "division_owner"), report("reviewed"), org)).toEqual([]);
    expect(reportActions(actor("b", "division_owner"), report("reviewed"), org)).toEqual([]);
    expect(reportActions(preparer, report("approved"), org)).toEqual(["distribute"]);
    expect(reportActions(preparer, report("distributed"), org)).toEqual([]);
  });
  it("moves through the states, and a return needs a note", () => {
    expect(reportStep(preparer, report("draft"), "submit", "", org)).toEqual({ ok: true, to: "submitted" });
    expect(reportStep(reviewer, report("submitted"), "review", "", org)).toEqual({ ok: true, to: "reviewed" });
    expect(reportStep(head, report("reviewed"), "return", " ", org)).toEqual({ ok: false, problem: "note" });
    expect(reportStep(head, report("reviewed"), "return", "Salah", org)).toEqual({ ok: true, to: "draft" });
    expect(reportStep(head, report("draft"), "approve", "", org)).toEqual({ ok: false, problem: "forbidden" });
  });
  it("submits financial statements only when every month is closed", () => {
    expect(reportProblem("pnl", ["ESTRADA"], [1, 2], [{ entity: "ESTRADA", month: 1 }])).toEqual(["ESTRADA:2"]);
    expect(reportProblem("aging", ["ESTRADA"], [1], [])).toEqual([]);
  });
});
