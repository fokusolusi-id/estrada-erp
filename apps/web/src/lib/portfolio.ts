import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { ZERO, deliveryHealth, drawingOwed, lifecycle, money, portfolioFigures, sum, type Money } from "@estrada/domain";
import { loadProjects } from "./implementasi";

/** Each project's money, read from the modules that record it (FC10); nothing is typed here. */
export async function loadPortfolio(entities: readonly string[], today: string) {
  const [projects, deals, invoices, receipts, costs, guarantees, repaid] = await Promise.all([
    loadProjects(),
    db.select({ id: schema.pipelineDeal.id, value: schema.pipelineDeal.value }).from(schema.pipelineDeal),
    db.select().from(schema.invoice).where(eq(schema.invoice.state, "issued")),
    db.select({ invoiceId: schema.cashReceipt.invoiceId, amount: schema.cashReceipt.amount }).from(schema.cashReceipt).where(isNull(schema.cashReceipt.reversedAt)),
    db
      .select({ request: schema.paymentRequest })
      .from(schema.paymentRequest)
      .innerJoin(schema.budgetLine, eq(schema.budgetLine.id, schema.paymentRequest.budgetLineId))
      .innerJoin(schema.coaAccount, eq(schema.coaAccount.code, schema.budgetLine.coaCode))
      .where(and(inArray(schema.paymentRequest.state, ["paid"]), eq(schema.coaAccount.category, "COGS"))),
    db.select().from(schema.facilityDrawing).where(and(eq(schema.facilityDrawing.kind, "bg"), eq(schema.facilityDrawing.state, "issued"))),
    db.select().from(schema.facilityPayment).where(isNull(schema.facilityPayment.reversedAt)),
  ]);
  const paid = repaid.map((p) => ({ drawingId: p.drawingId, principal: money(p.principal) }));
  const contract = new Map(deals.map((d) => [d.id, money(d.value)]));
  return projects
    .filter((p) => entities.includes(p.entity))
    .map((p) => {
      const bills = invoices.filter((i) => i.projectId === p.id);
      const ids = new Set(bills.map((i) => i.id));
      const revenue = sum(bills.map((i) => money(i.dpp)));
      const spent = costs.map((c) => c.request).filter((r) => r.projectId === p.id);
      const cogs = sum(spent.map((r) => money(r.gross)));
      const cashIn = sum(receipts.filter((r) => ids.has(r.invoiceId)).map((r) => money(r.amount)));
      const expected = sum(bills.map((i) => money(i.receivable)));
      const bgs = guarantees.filter((g) => g.projectId === p.id);
      const outstanding: Money = expected.minus(cashIn);
      return {
        id: p.id,
        name: p.name,
        customer: p.customer,
        entity: p.entity,
        contract: contract.get(p.dealId) ?? ZERO,
        revenue,
        cogs,
        ...portfolioFigures(revenue, cogs),
        cashIn,
        receivable: outstanding.gt(0) ? outstanding : ZERO,
        bg: sum(bgs.map((g) => drawingOwed({ id: g.id, kind: g.kind, state: g.state, amount: money(g.amount) }, paid))),
        stage: lifecycle(p.status),
        health: deliveryHealth({ status: p.status, rfsOn: p.rfs.on, rfsTargetOn: p.rfsTargetOn, sites: p.sites.map((s) => ({ status: s.status, plannedDoneOn: s.tglPlanSelesai, actualDoneOn: s.tglAktualSelesai ?? null })) }, today),
        invoices: bills,
        costs: spent,
        guarantees: bgs,
      };
    });
}

export type PortfolioRow = Awaited<ReturnType<typeof loadPortfolio>>[number];
