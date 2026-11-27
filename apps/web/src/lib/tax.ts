import "server-only";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { bupotNeeded, money, sum, taxReport, type Actor, type Money, type TaxItem, type TaxKind } from "@estrada/domain";

export interface TaxRow extends TaxItem {
  /** The invoice's or payment request's id. */
  sourceId: string;
  sourceNumber: string;
  party: string;
  npwp: string;
}

/**
 * Every tax document the books call for: a faktur per issued invoice with PPN, and per payment request past its draft a
 * vendor faktur where it carries PPN and a bukti potong where PPh was withheld.
 */
export async function loadTaxItems(): Promise<{ items: TaxRow[]; fromUs: { entity: string; date: string; pph: Money }[] }> {
  const [invoices, bills, documents] = await Promise.all([
    db
      .select({ invoice: schema.invoice, customer: schema.customer.legalName, npwp: schema.customer.npwp })
      .from(schema.invoice)
      .innerJoin(schema.customer, eq(schema.customer.id, schema.invoice.customerId))
      .where(eq(schema.invoice.state, "issued")),
    db
      .select({ request: schema.paymentRequest, partner: schema.partner.name, npwp: schema.partner.npwp })
      .from(schema.paymentRequest)
      .leftJoin(schema.partner, eq(schema.partner.id, schema.paymentRequest.partnerId))
      .where(notInArray(schema.paymentRequest.state, ["draft", "returned"])),
    db.select().from(schema.taxDocument),
  ]);
  const recorded = (kind: TaxKind, sourceId: string) => {
    const d = documents.find((x) => x.kind === kind && (kind === "faktur_out" ? x.invoiceId : x.paymentId) === sourceId);
    return d ? { number: d.number, date: d.documentDate, status: d.status } : null;
  };
  const items: TaxRow[] = invoices
    .filter(({ invoice: i }) => money(i.ppn).gt(0))
    .map(({ invoice: i, customer, npwp }) => ({
      kind: "faktur_out" as const, entity: i.entityCode, baseDate: i.invoicedOn, dpp: money(i.dpp), amount: money(i.ppn), wapu: i.wapu, pphType: null,
      sourceId: i.id, sourceNumber: i.number ?? "", party: customer, npwp: npwp ?? "", document: recorded("faktur_out", i.id),
    }));
  for (const { request: r, partner, npwp } of bills) {
    const base = {
      entity: r.entityCode, dpp: money(r.gross), wapu: false, sourceId: r.id, sourceNumber: r.number ?? "",
      party: partner ?? r.payeeName ?? "", npwp: npwp ?? "",
    };
    const submitted = (r.submittedAt ?? r.createdAt).toISOString().slice(0, 10);
    if (money(r.ppn).gt(0)) items.push({ ...base, kind: "faktur_in", baseDate: r.billDate ?? submitted, amount: money(r.ppn), pphType: null, document: recorded("faktur_in", r.id) });
    if (bupotNeeded(money(r.pph))) items.push({ ...base, kind: "bupot", baseDate: r.paidOn ?? r.billDate ?? submitted, amount: money(r.pph), pphType: r.pphType, document: recorded("bupot", r.id) });
  }
  return {
    items,
    fromUs: invoices.filter(({ invoice: i }) => money(i.pph).gt(0)).map(({ invoice: i }) => ({ entity: i.entityCode, date: i.invoicedOn, pph: money(i.pph) })),
  };
}

/** A month's figures for the chosen companies, with its documents. */
export async function loadTaxMonth(actor: Actor, period: string, chosen: string | null) {
  const [year, month] = [Number(period.slice(0, 4)), Number(period.slice(5, 7))];
  const companies = (await db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true))).map((c) => c.code).sort();
  const mine = companies.filter((c) => actor.entities.includes("*") || actor.entities.includes(c));
  const entities = chosen && mine.includes(chosen) ? [chosen] : mine;
  const [{ items, fromUs }, pph21] = await Promise.all([
    loadTaxItems(),
    db.select().from(schema.taxPph21).where(and(eq(schema.taxPph21.year, year), eq(schema.taxPph21.month, month), inArray(schema.taxPph21.entityCode, mine.length ? mine : [""]))),
  ]);
  const report = taxReport(items, {
    period,
    entities,
    pph21: sum(pph21.filter((p) => entities.includes(p.entityCode)).map((p) => money(p.amount))),
    withheldFromUs: sum(fromUs.filter((f) => entities.includes(f.entity) && f.date.startsWith(period)).map((f) => f.pph)),
  });
  return { entities, mine, report, items: items.filter((i) => entities.includes(i.entity)), pph21 };
}
