import { describe, expect, it } from "vitest";
import { achievement, canEditKpi, consolidateTargets, kpiActions, kpiProblem, kpiStep, phasedTarget, type KpiTargets } from "../src/kpi";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import { DEFAULT_SEASONALITY } from "../src/scenario";

const org = new OrgTree([{ code: "DIR", parent: null }]);
const director = (userId: string, entities: string[]): Actor => ({ userId, role: "director", orgUnit: "DIR", entities });
const pt = director("pt", ["ESTRADA"]);
const bod = director("bod", ["*"]);
const t = (revenue: string, ebitdaPct: string, cashIn: string, netPct: string, direct = "0"): KpiTargets => ({ revenue: money(revenue), revenueDirect: money(direct), ebitdaPct: money(ebitdaPct), cashIn: money(cashIn), netMarginPct: money(netPct) });

describe("kpiProblem (sheet FC01_Set_KPI; BR-KPI-001, BR-TGT-002)", () => {
  it("needs positive amounts, percentages up to 100 and a direct part within the revenue", () => {
    expect(kpiProblem(t("230000", "20", "184000", "15", "30000"))).toBeNull();
    expect(kpiProblem(t("0", "20", "1", "15"))).toBe("revenue");
    expect(kpiProblem(t("1", "20", "0", "15"))).toBe("cash_in");
    expect(kpiProblem(t("1", "101", "1", "15"))).toBe("percent");
    expect(kpiProblem(t("1", "20", "1", "15", "2"))).toBe("direct");
  });
});

describe("approval (BR-KPI-003; client decision: by entity scope)", () => {
  const draft = { state: "draft" as const, entity: "ESTRADA", submittedBy: null, hasDocument: true };
  it("is submitted by the company's Direktur and approved by the BOD", () => {
    expect(kpiStep(draft, "submit", pt, "")).toEqual({ to: "submitted" });
    expect(kpiStep(draft, "submit", bod, "")).toEqual({ problem: "not_allowed" });
    const submitted = { ...draft, state: "submitted" as const, submittedBy: "pt" };
    expect(kpiStep(submitted, "approve", bod, "")).toEqual({ to: "approved" });
    expect(kpiStep(submitted, "approve", pt, "")).toEqual({ problem: "not_allowed" });
    expect(kpiStep(submitted, "return", bod, " ")).toEqual({ problem: "note_required" });
    expect(kpiActions({ ...draft, state: "approved" }, bod)).toEqual([]);
  });
  it("needs the board decision attached before approval", () => {
    expect(kpiStep({ ...draft, state: "submitted", hasDocument: false }, "approve", bod, "")).toEqual({ problem: "document_required" });
  });
  it("keeps another company's Direktur out, and lets a returned draft go again", () => {
    expect(canEditKpi(director("m", ["MATRIK"]), "ESTRADA")).toBe(false);
    expect(canEditKpi(pt, "ESTRADA")).toBe(true);
    expect(canEditKpi(bod, "ESTRADA")).toBe(false);
    expect(kpiStep({ ...draft, state: "returned" }, "submit", pt, "")).toEqual({ to: "submitted" });
  });
  void org;
});

describe("figures", () => {
  it("spreads a year's target over the months up to now (client decision: sheet 22 shares)", () => {
    expect(phasedTarget(money("450000"), DEFAULT_SEASONALITY, 3).toString()).toBe("76500");
    expect(phasedTarget(money("450000"), DEFAULT_SEASONALITY, 12).toString()).toBe("450000");
  });
  it("consolidates as the sum of the companies, margins weighted by revenue", () => {
    const c = consolidateTargets([t("230", "20", "184", "15", "10"), t("220", "0", "176", "0")]);
    expect([c.revenue, c.cashIn, c.revenueDirect, c.ebitdaPct.toDecimalPlaces(2), c.netMarginPct.toDecimalPlaces(2)].map(String)).toEqual(["450", "360", "10", "10.22", "7.67"]);
    expect(consolidateTargets([]).ebitdaPct.toString()).toBe("0");
  });
  it("shows actual against target in percent, or nothing without a target", () => {
    expect(achievement(money("50"), money("200"))?.toString()).toBe("25");
    expect(achievement(money("5"), money("0"))).toBeNull();
  });
});
