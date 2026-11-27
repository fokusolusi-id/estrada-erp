import { describe, expect, it } from "vitest";
import { monthPnl, type PnlLine } from "../src/closing";
import { money } from "../src/money";
import { comparePnl, consolidatePnl, pnlGroupOf, statement, type EntityPnl } from "../src/pnl-report";

const line = (coaCode: string, category: PnlLine["category"], amount: string): PnlLine => ({ coaCode, name: coaCode, category, amount: money(amount) });

describe("pnlGroupOf (P1-M6: Revenue to Net Profit)", () => {
  it("places each account", () => {
    const of = (code: string, c: PnlLine["category"]) => pnlGroupOf({ coaCode: code, category: c });
    expect([of("4100", "Revenue"), of("5110", "COGS"), of("5801", "COGS"), of("6210", "OPEX"), of("6291", "OPEX")]).toEqual(["revenue", "cogs", "depreciation", "opex", "depreciation"]);
    expect([of("7110", "OTHERS"), of("7221", "OTHERS"), of("7230", "OTHERS"), of("7290", "OTHERS"), of("", "OTHERS"), of("8100", "TAX")]).toEqual(["other_income", "interest", "interest", "other_expense", "other_expense", "tax"]);
  });
});

describe("statement", () => {
  const s = statement([line("4100", "Revenue", "1000"), line("5110", "COGS", "400"), line("5801", "COGS", "50"), line("6210", "OPEX", "100"), line("7110", "OTHERS", "10"), line("7221", "OTHERS", "30"), line("7290", "OTHERS", "5"), line("8100", "TAX", "25")]);
  it("steps from revenue to net profit", () => {
    expect([s.revenue, s.cogs, s.gross, s.opex, s.ebitda, s.depreciation, s.ebit, s.other_income, s.interest, s.other_expense, s.ebt, s.tax, s.net].map(String)).toEqual(
      ["1000", "400", "600", "100", "500", "50", "450", "10", "30", "5", "425", "25", "400"],
    );
  });
});

describe("consolidatePnl (BR-FIN-007; P1-M9 elimination)", () => {
  const accounts = new Map([["4100", { name: "Sewa", category: "Revenue" as const }], ["5110", { name: "Subkon", category: "COGS" as const }], ["1521", { name: "Alat", category: "CAPEX" as const }]]);
  const a = monthPnl({ revenue: [{ coaCode: "4100", amount: money("900") }, { coaCode: "4100", amount: money("100"), counterparty: "MATRIK" }], costs: [], interest: [], accounts });
  const b = monthPnl({ revenue: [], costs: [{ coaCode: "5110", amount: money("95"), counterparty: "ESTRADA" }, { coaCode: "5110", amount: money("40") }, { coaCode: "1521", amount: money("7"), counterparty: "ESTRADA" }], interest: [], accounts });
  const both: EntityPnl[] = [{ entity: "ESTRADA", lines: a.lines, intercompany: a.intercompany }, { entity: "MATRIK", lines: b.lines, intercompany: b.intercompany }];

  it("keeps who each sale or cost was with, capital spending aside", () => {
    expect(a.intercompany.map((i) => [i.coaCode, i.counterparty, i.amount.toString()])).toEqual([["4100", "MATRIK", "100"]]);
    expect(b.intercompany.map((i) => i.coaCode)).toEqual(["5110"]);
  });
  it("removes sales and costs between the companies consolidated", () => {
    const out = consolidatePnl(both, true);
    expect(out.lines.map((l) => [l.coaCode, l.amount.toString()])).toEqual([["4100", "900"], ["5110", "40"]]);
    expect([out.eliminated.revenue.toString(), out.eliminated.cost.toString()]).toEqual(["100", "95"]);
  });
  it("shows the pairs that do not match", () => {
    expect(consolidatePnl(both, true).pairs.map((p) => [p.seller, p.buyer, p.revenue.toString(), p.cost.toString()])).toEqual([["ESTRADA", "MATRIK", "100", "95"]]);
  });
  it("leaves them in before elimination, or when the other company is not included", () => {
    expect(statement(consolidatePnl(both, false).lines).revenue.toString()).toBe("1000");
    expect(statement(consolidatePnl([both[0]!], true).lines).revenue.toString()).toBe("1000");
  });
});

describe("comparePnl (BR-FIN-004: comparable with the RKA)", () => {
  const rows = comparePnl([line("4100", "Revenue", "80"), line("5110", "COGS", "30")], [line("4100", "Revenue", "100"), line("6210", "OPEX", "20")]);
  it("sets actual beside plan for every statement row, with the share achieved", () => {
    const revenue = rows.find((r) => r.key === "revenue")!;
    expect([revenue.actual, revenue.budget, revenue.variance, revenue.achieved].map(String)).toEqual(["80", "100", "-20", "80"]);
    expect(rows.find((r) => r.key === "cogs")!.achieved).toBeNull();
  });
  it("lists the accounts under each group", () => {
    expect(rows.find((r) => r.key === "opex")!.accounts.map((a) => [a.coaCode, a.actual.toString(), a.budget.toString()])).toEqual([["6210", "0", "20"]]);
    expect(rows.find((r) => r.key === "net")!.accounts).toEqual([]);
  });
});
