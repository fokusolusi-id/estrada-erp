/** Profit per project: contract, cost, OPEX share, margins and rating (plan E9; sheet 29_Project_Profitability). */
import { ZERO, money, sum, type Money } from "./money";
import type { Lifecycle } from "./portfolio";

export type ProfitRating = "excellent" | "good" | "marginal" | "loss";
export const PROFIT_RATING_LABEL: Record<ProfitRating, string> = { excellent: "★★★ Excellent", good: "★★ Good", marginal: "★ Marginal", loss: "⚠ Loss Risk" };
/** The sheet's formula reads the EBITDA margin. */
export const profitRating = (ebitdaPct: Money): ProfitRating => (ebitdaPct.gte(20) ? "excellent" : ebitdaPct.gte(12) ? "good" : ebitdaPct.gte(5) ? "marginal" : "loss");

/** `taxRate` is a fraction. Without cost recorded the margins are not yet a verdict, so there is no rating. */
export function profitability(contract: Money, cogs: Money, opex: Money | null, taxRate: Money) {
  const share = (v: Money | null) => (v && contract.gt(0) ? v.times(100).div(contract).toDecimalPlaces(1) : null);
  const grossProfit = contract.minus(cogs);
  const ebitda = opex ? grossProfit.minus(opex) : null;
  const net = ebitda ? ebitda.times(money("1").minus(taxRate)).toDecimalPlaces(2) : null;
  const ebitdaPct = share(ebitda);
  return { grossProfit, gpPct: share(grossProfit), ebitda, ebitdaPct, net, netPct: share(net), rating: ebitdaPct && cogs.gt(0) ? profitRating(ebitdaPct) : null };
}

/** Each company's OPEX split over its running projects by contract value; the last takes the rounding. */
export function allocateProjectOpex(opexByEntity: ReadonlyMap<string, Money>, projects: readonly { id: string; entity: string; contract: Money; stage: Lifecycle }[]): Map<string, Money> {
  const out = new Map<string, Money>();
  const running = projects.filter((p) => (p.stage === "won" || p.stage === "active") && p.contract.gt(0));
  for (const [entity, opex] of opexByEntity) {
    const mine = running.filter((p) => p.entity === entity);
    const total = sum(mine.map((p) => p.contract));
    let given = ZERO;
    mine.forEach((p, i) => {
      const part = i === mine.length - 1 ? opex.minus(given) : opex.times(p.contract).div(total).toDecimalPlaces(2);
      given = given.plus(part);
      out.set(p.id, part);
    });
  }
  return out;
}

export const rankByNet = <R extends { net: Money | null; rating: ProfitRating | null }>(rows: readonly R[]): R[] => rows.filter((r) => r.rating && r.net).sort((a, b) => b.net!.comparedTo(a.net!));
