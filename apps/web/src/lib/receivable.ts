import "server-only";
import { eq, isNull } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { ZERO, money, outstandingOf, type Money } from "@estrada/domain";
import { billableTermins } from "./invoice";

/** Issued invoices with what is still expected, and termin not yet billed, within `shown` entities. */
export async function loadReceivables(shown: (entity: string) => boolean) {
  const [invoices, receipts, termins] = await Promise.all([
    db
      .select({ invoice: schema.invoice, customer: schema.customer.nickname, project: schema.pipelineDeal.project })
      .from(schema.invoice)
      .innerJoin(schema.customer, eq(schema.customer.id, schema.invoice.customerId))
      .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.invoice.dealId))
      .where(eq(schema.invoice.state, "issued")),
    db.select({ invoiceId: schema.cashReceipt.invoiceId, amount: schema.cashReceipt.amount }).from(schema.cashReceipt).where(isNull(schema.cashReceipt.reversedAt)),
    billableTermins(),
  ]);
  const received = new Map<string, Money>();
  for (const r of receipts) received.set(r.invoiceId, (received.get(r.invoiceId) ?? ZERO).plus(money(r.amount)));
  return {
    open: invoices
      .filter((r) => shown(r.invoice.entityCode))
      .map((r) => ({
        id: r.invoice.id,
        number: r.invoice.number ?? "",
        entity: r.invoice.entityCode,
        customer: r.customer,
        project: r.project,
        dueOn: r.invoice.dueOn,
        outstanding: outstandingOf({ receivable: money(r.invoice.receivable) }, received.get(r.invoice.id) ?? ZERO),
      }))
      .filter((r) => r.outstanding.gt(0)),
    termins: termins.filter((t) => shown(t.entity)),
  };
}
