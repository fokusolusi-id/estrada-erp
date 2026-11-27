import "server-only";
import { and, between, eq, isNull } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { money, monthPnl, type BalanceTotals } from "@estrada/domain";

type Reader = Pick<typeof db, "select">;

/** A company's month from the sub-ledgers, as Realisasi books it: a payment request counts when paid. */
export async function loadMonthPnl(from: Reader, entity: string, year: number, month: number) {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const [first, last] = [`${prefix}-01`, new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)];
  const [invoices, paid, adjustments, interest, entries, accounts] = await Promise.all([
    from
      .select({ dpp: schema.invoice.dpp, coaCode: schema.invoice.revenueCoa, counterparty: schema.customer.groupEntityCode })
      .from(schema.invoice)
      .innerJoin(schema.customer, eq(schema.customer.id, schema.invoice.customerId))
      .where(and(eq(schema.invoice.entityCode, entity), eq(schema.invoice.state, "issued"), between(schema.invoice.invoicedOn, first, last))),
    from
      .select({ amount: schema.paymentRequest.gross, coaCode: schema.budgetLine.coaCode, counterparty: schema.partner.groupEntityCode })
      .from(schema.paymentRequest)
      .leftJoin(schema.partner, eq(schema.partner.id, schema.paymentRequest.partnerId))
      .leftJoin(schema.budgetLine, eq(schema.budgetLine.id, schema.paymentRequest.budgetLineId))
      .where(and(eq(schema.paymentRequest.entityCode, entity), eq(schema.paymentRequest.state, "paid"), between(schema.paymentRequest.paidOn, first, last))),
    from
      .select({ amount: schema.actualAdjustment.amount, coaCode: schema.actualAdjustment.coaCode })
      .from(schema.actualAdjustment)
      .where(and(eq(schema.actualAdjustment.entityCode, entity), between(schema.actualAdjustment.datedOn, first, last))),
    from
      .select({ amount: schema.facilityPayment.interest })
      .from(schema.facilityPayment)
      .where(and(eq(schema.facilityPayment.entityCode, entity), isNull(schema.facilityPayment.reversedAt), between(schema.facilityPayment.paidOn, first, last))),
    from
      .select({ amount: schema.cashEntry.amount, coaCode: schema.cashEntry.coaCode, kind: schema.cashEntry.kind })
      .from(schema.cashEntry)
      .where(and(eq(schema.cashEntry.entityCode, entity), isNull(schema.cashEntry.reversedAt), between(schema.cashEntry.onDate, first, last))),
    from.select({ code: schema.coaAccount.code, name: schema.coaAccount.name, category: schema.coaAccount.category }).from(schema.coaAccount),
  ]);
  return monthPnl({
    revenue: invoices.map((i) => ({ coaCode: i.coaCode, amount: money(i.dpp), counterparty: i.counterparty })),
    costs: [...paid, ...adjustments.map((a) => ({ ...a, counterparty: null })), ...entries.filter((e) => e.kind === "cost").map((e) => ({ ...e, counterparty: null }))].map((c) => ({
      coaCode: c.coaCode,
      amount: money(c.amount),
      counterparty: c.counterparty,
    })),
    interest: [...interest, ...entries.filter((e) => e.kind === "interest")].map((i) => money(i.amount)).filter((i) => i.gt(0)),
    accounts: new Map(accounts.map((a) => [a.code, a])),
  });
}

export const balanceOf = (row: typeof schema.balanceSheet.$inferSelect | undefined): BalanceTotals | null =>
  row
    ? {
        currentAssets: money(row.currentAssets),
        totalAssets: money(row.totalAssets),
        currentLiabilities: money(row.currentLiabilities),
        totalLiabilities: money(row.totalLiabilities),
        equity: money(row.equity),
      }
    : null;
