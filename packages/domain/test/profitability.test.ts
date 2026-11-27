import { describe, expect, it } from "vitest";
import { money } from "../src/money";
import { allocateProjectOpex, profitRating, profitability, rankByNet } from "../src/profitability";

const m = (v: string) => money(v);

describe("profitability (sheet 29_Project_Profitability, row PRJ-2026-001)", () => {
  const f = profitability(m("8500000000"), m("6100000000"), m("850000000"), m("0.22"));
  it("takes GP, EBITDA and net profit as the sheet does", () => {
    expect([f.grossProfit, f.ebitda!, f.net!].map(String)).toEqual(["2400000000", "1550000000", "1209000000"]);
    expect([f.gpPct, f.ebitdaPct, f.netPct].map((v) => v!.toString())).toEqual(["28.2", "18.2", "14.2"]);
    expect(f.rating).toBe("good");
  });
  it("rates on the EBITDA margin: 20 / 12 / 5", () => {
    expect(["20", "19.9", "12", "11.9", "5", "4.9", "-3"].map((v) => profitRating(m(v)))).toEqual(["excellent", "good", "good", "marginal", "marginal", "loss", "loss"]);
  });
  it("has no EBITDA without an OPEX share, and no rating before any cost is recorded", () => {
    expect(profitability(m("100"), m("50"), null, m("0.22"))).toMatchObject({ ebitda: null, net: null, rating: null });
    expect(profitability(m("100"), m("0"), m("10"), m("0.22")).rating).toBeNull();
    expect(profitability(m("0"), m("0"), m("0"), m("0.22")).gpPct).toBeNull();
  });
});

describe("allocateProjectOpex (client: the PT's RKA OPEX by contract value over running projects)", () => {
  const p = (id: string, entity: string, contract: string, stage: "won" | "active" | "closed" | "drop" = "active") => ({ id, entity, contract: m(contract), stage });
  const out = allocateProjectOpex(new Map([["A", m("100")], ["B", m("50")]]), [p("1", "A", "100"), p("2", "A", "200"), p("3", "A", "700", "closed"), p("4", "B", "0"), p("5", "C", "10", "won")]);
  it("splits each company's OPEX with nothing lost to rounding", () => {
    expect([out.get("1")!.toString(), out.get("2")!.toString()]).toEqual(["33.33", "66.67"]);
  });
  it("gives nothing to closed projects, or where there is no contract value or RKA OPEX", () => {
    expect(["3", "4", "5"].map((id) => out.get(id) ?? null)).toEqual([null, null, null]);
  });
});

describe("rankByNet", () => {
  it("puts the most profitable first and leaves out the unrated", () => {
    expect(rankByNet([{ id: "a", net: m("1"), rating: "good" as const }, { id: "b", net: m("5"), rating: "good" as const }, { id: "c", net: m("9"), rating: null }]).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
