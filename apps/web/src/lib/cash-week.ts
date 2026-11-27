import "server-only";
import { and, asc, between, eq, isNull } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { isIndirectReceipt, money, nettAmount, type CashEvent, type Money } from "@estrada/domain";

/**
 * A year's cash movements per company: receipts against invoices, paid payment requests at their nett, bank drawdowns,
 * principal and interest, and what Cash Management typed; with each company's cash on 1 January (the opening typed on Arus Kas).
 */
export async function loadCashYear(year: number) {
  const [from, to] = [`${year}-01-01`, `${year}-12-31`];
  const [openings, receipts, payments, entries, drawdowns, repayments] = await Promise.all([
    db.select({ entity: schema.cashOpening.entityCode, cash: schema.cashOpening.cash }).from(schema.cashOpening).where(eq(schema.cashOpening.fiscalYear, year)),
    db
      .select({ entity: schema.invoice.entityCode, date: schema.cashReceipt.receivedOn, amount: schema.cashReceipt.amount, customer: schema.customer.legalName, endCustomer: schema.pipelineDeal.endCustomer })
      .from(schema.cashReceipt)
      .innerJoin(schema.invoice, eq(schema.invoice.id, schema.cashReceipt.invoiceId))
      .innerJoin(schema.customer, eq(schema.customer.id, schema.invoice.customerId))
      .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.invoice.dealId))
      .where(and(isNull(schema.cashReceipt.reversedAt), between(schema.cashReceipt.receivedOn, from, to))),
    db
      .select({ request: schema.paymentRequest, coaCode: schema.budgetLine.coaCode })
      .from(schema.paymentRequest)
      .leftJoin(schema.budgetLine, eq(schema.budgetLine.id, schema.paymentRequest.budgetLineId))
      .where(and(eq(schema.paymentRequest.state, "paid"), between(schema.paymentRequest.paidOn, from, to))),
    db
      .select({ entry: schema.cashEntry, by: schema.user.name })
      .from(schema.cashEntry)
      .innerJoin(schema.user, eq(schema.user.id, schema.cashEntry.createdBy))
      .where(between(schema.cashEntry.onDate, from, to))
      .orderBy(asc(schema.cashEntry.onDate), asc(schema.cashEntry.createdAt)),
    db
      .select()
      .from(schema.facilityDrawing)
      .where(and(eq(schema.facilityDrawing.kind, "loan"), eq(schema.facilityDrawing.state, "issued"), eq(schema.facilityDrawing.opening, false), between(schema.facilityDrawing.issuedOn, from, to))),
    db.select().from(schema.facilityPayment).where(and(isNull(schema.facilityPayment.reversedAt), between(schema.facilityPayment.paidOn, from, to))),
  ]);
  const events: CashEvent[] = [
    ...receipts.map((r) => ({ entity: r.entity, date: r.date, kind: isIndirectReceipt(r.customer, r.endCustomer) ? ("in_indirect" as const) : ("in_direct" as const), amount: money(r.amount), coaCode: null })),
    ...payments.map(({ request: r, coaCode }) => ({
      entity: r.entityCode,
      date: r.paidOn!,
      kind: "payment" as const,
      amount: nettAmount({ gross: money(r.gross), ppn: money(r.ppn), pph: money(r.pph) }),
      coaCode,
    })),
    ...drawdowns.map((d) => ({ entity: d.entityCode, date: d.issuedOn!, kind: "loan_in" as const, amount: money(d.amount), coaCode: null })),
    ...repayments.flatMap((p) =>
      (["repayment", "interest"] as const).map((kind) => ({ entity: p.entityCode, date: p.paidOn, kind, amount: money(kind === "repayment" ? p.principal : p.interest), coaCode: null })).filter((e) => e.amount.gt(0)),
    ),
    ...entries.filter(({ entry: e }) => !e.reversedAt).map(({ entry: e }) => ({ entity: e.entityCode, date: e.onDate, kind: e.kind, amount: money(e.amount), coaCode: e.coaCode })),
  ];
  return { openings: new Map<string, Money>(openings.map((o) => [o.entity, money(o.cash)])), events, entries };
}
