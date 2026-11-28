import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import { EW_RULES, canActOnAlert, canViewAlert, escalationLevel, evaluateRules, nextAlertStep, ruleRecipients, unjudgedRules, type EwFigures } from "../src/early-warning";
import { money } from "../src/money";

const org = new OrgTree([{ code: "FRM", parent: null }, { code: "BCD", parent: null }, { code: "PDMS", parent: null }, { code: "PMO", parent: "PDMS" }, { code: "HCM", parent: null }]);
const b = (v: number) => money(String(v)).times(1_000_000_000);
const calm: EwFigures = {
  cash: { ending: b(30), runwayMonths: money("3") },
  obligo: { used: b(80), plafon: b(100) },
  quarterRevenue: { actual: b(75), target: b(100) },
  receivable: { over90: b(1), total: b(10), overdue30: b(5) },
  dso: [money("61"), money("61"), money("60")],
  pipeline: { open: b(20), remaining: b(10) },
  interest: { ebit: b(3), expense: b(1) },
  balance: { liabilities: b(15), equity: b(10) },
  rolling: { net: b(5), revenue: b(100) },
  headcount: { actual: 90, plan: 100 },
  divisions: [{ unit: "BCD", actual: b(110), budget: b(100) }],
  units: [{ unit: "BCD-GOV", actual: b(115), budget: b(100) }],
};
const fired = (f: Partial<EwFigures>) => evaluateRules({ ...calm, ...f }).filter((r) => r.fired).map((r) => `${r.code}${r.subject ? `:${r.subject}` : ""}`);

describe("the fifteen rules (sheet P3_Module_Spec, P3-M4)", () => {
  it("lists them", () => expect(EW_RULES.map((r) => r.code)).toEqual(Array.from({ length: 15 }, (_, i) => `EW-${String(i + 1).padStart(2, "0")}`)));
  it("stays quiet at every limit", () => expect(fired({})).toEqual([]));
  it("fires just past each limit", () => {
    expect(fired({ cash: { ending: b(19), runwayMonths: money("3") } })).toEqual(["EW-01"]);
    expect(fired({ cash: { ending: b(30), runwayMonths: money("1.9") } })).toEqual(["EW-01"]);
    expect(fired({ obligo: { used: b(81), plafon: b(100) } })).toEqual(["EW-02"]);
    expect(fired({ quarterRevenue: { actual: b(74), target: b(100) } })).toEqual(["EW-03"]);
    expect(fired({ receivable: { over90: b(2), total: b(10), overdue30: b(6) } })).toEqual(["EW-04", "EW-11"]);
    expect(fired({ dso: [money("61"), money("61"), money("61")] })).toEqual(["EW-05"]);
    expect(fired({ pipeline: { open: b(19), remaining: b(10) } })).toEqual(["EW-06"]);
    expect(fired({ divisions: [{ unit: "BCD", actual: b(111), budget: b(100) }], units: [{ unit: "BCD-GOV", actual: b(116), budget: b(100) }] })).toEqual(["EW-08:BCD", "EW-09:BCD-GOV"]);
    expect(fired({ interest: { ebit: b(2), expense: b(1) } })).toEqual(["EW-12"]);
    expect(fired({ balance: { liabilities: b(16), equity: b(10) } })).toEqual(["EW-13"]);
    expect(fired({ rolling: { net: b(4), revenue: b(100) } })).toEqual(["EW-14"]);
    expect(fired({ headcount: { actual: 89, plan: 100 } })).toEqual(["EW-15"]);
  });
  it("has no verdict without data, and none for the rules the app has no figures for", () => {
    const none = evaluateRules({ ...calm, cash: null, obligo: { used: b(0), plafon: b(0) }, headcount: { actual: 5, plan: 0 } });
    expect(none.filter((r) => r.fired === null).map((r) => r.code)).toEqual(["EW-01", "EW-02", "EW-07", "EW-10", "EW-15"]);
  });
});

describe("acknowledge and escalation (client decision: 1/2/3/7 days)", () => {
  it("rises after the deadline and again after twice the deadline", () => {
    const level = (severity: "critical" | "high" | "medium" | "low", today: string) => escalationLevel(severity, "2027-06-01", today);
    expect([level("critical", "2027-06-01"), level("critical", "2027-06-02"), level("critical", "2027-06-03"), level("low", "2027-06-07"), level("low", "2027-06-08"), level("low", "2027-06-15")]).toEqual([0, 1, 2, 0, 1, 2]);
  });
  const seat = (occupant: string, orgUnit: string, role: "division_owner" | "director" | "cash_manager" | "default_owner", entities = ["*"]) => ({ occupant, orgUnit, role, entities });
  const seats = [seat("cfo", "FRM", "division_owner"), seat("ceo", "DIR", "director"), seat("pt", "DIR", "director", ["PAS"]), seat("cash", "FRM", "cash_manager"), seat("bcd", "BCD", "division_owner"), seat("pmo", "PMO", "default_owner")];
  it("goes to the rule's owners, the CFO when nobody holds the seat", () => {
    const to = (code: string, subject = "") => ruleRecipients(code, subject, seats, org).sort();
    expect([to("EW-02"), to("EW-03"), to("EW-08", "BCD"), to("EW-07"), to("EW-15")]).toEqual([["cash", "cfo"], ["bcd", "ceo"], ["bcd", "cfo"], ["pmo"], ["cfo"]]);
  });
  it("goes to the group Direktur when the CFO seat is empty too", () => expect(ruleRecipients("EW-01", "", seats.filter((s) => s.occupant !== "cfo"), org)).toEqual(["ceo"]));
  const alert = { status: "open" as const, assignees: ["bcd"] };
  const actor = (userId: string, role: "director" | "auditor" | "finance" | "division_owner" | "requestor", orgUnit = "BCD", entities = ["*"]) => ({ userId, role, orgUnit, entities });
  it("is seen by the owners, Finance, the CFO, the group Direktur and the Auditor", () => {
    const see = [actor("bcd", "division_owner"), actor("f", "finance"), actor("c", "division_owner", "FRM"), actor("d", "director"), actor("a", "auditor"), actor("p", "director", "DIR", ["PAS"]), actor("r", "requestor")];
    expect(see.map((a) => canViewAlert(a, alert, org))).toEqual([true, true, true, true, true, false, false]);
    expect(see.map((a) => canActOnAlert(a, alert, org))).toEqual([true, false, true, true, false, false, false]);
  });
  it("is acknowledged, then resolved with a note", () => {
    expect(nextAlertStep("open", "ack", "")).toEqual({ ok: true, to: "acknowledged" });
    expect(nextAlertStep("acknowledged", "resolve", " ")).toEqual({ ok: false, problem: "note" });
    expect(nextAlertStep("open", "false_positive", "salah data")).toEqual({ ok: true, to: "false_positive" });
    expect(nextAlertStep("resolved", "ack", "")).toEqual({ ok: false, problem: "closed" });
  });
});

describe("rules without data", () => {
  it("names the rules nothing could be judged for, so silence is not read as safety", () => {
    expect(unjudgedRules(evaluateRules(calm))).toEqual(["EW-07", "EW-10"]);
    expect(unjudgedRules(evaluateRules({ ...calm, cash: null, divisions: [] }))).toEqual(["EW-01", "EW-07", "EW-08", "EW-10"]);
  });
});
