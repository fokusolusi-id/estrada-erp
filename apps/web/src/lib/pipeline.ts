import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { money, terminSchedule, type DealInput, type Money } from "@estrada/domain";
import { reportVersions } from "./rka";

/** The Pipeline register follows the RKA being reported: the open version's year, else the latest locked one's. */
export async function pipelineYear(): Promise<number | null> {
  const [version] = await reportVersions();
  return version?.fiscalYear ?? null;
}

export interface RecoveryPlan {
  plan: string;
  updatedBy: string | null;
  updatedAt: Date;
}

export async function loadPipeline(
  fiscalYear: number,
): Promise<{ deals: (DealInput & { id: string })[]; targets: Map<string, Money>; recovery: Map<string, RecoveryPlan> }> {
  const [rows, targets, plans] = await Promise.all([
    db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.fiscalYear, fiscalYear)).orderBy(asc(schema.pipelineDeal.createdAt), asc(schema.pipelineDeal.sourceRef)),
    db.select().from(schema.pipelineTarget).where(eq(schema.pipelineTarget.fiscalYear, fiscalYear)),
    db
      .select({ segment: schema.pipelineRecoveryPlan.segment, plan: schema.pipelineRecoveryPlan.plan, updatedAt: schema.pipelineRecoveryPlan.updatedAt, updatedBy: schema.user.name })
      .from(schema.pipelineRecoveryPlan)
      .leftJoin(schema.user, eq(schema.user.id, schema.pipelineRecoveryPlan.updatedBy))
      .where(eq(schema.pipelineRecoveryPlan.fiscalYear, fiscalYear)),
  ]);
  const termins = rows.length
    ? await db
        .select()
        .from(schema.billingTermin)
        .where(inArray(schema.billingTermin.dealId, rows.map((r) => r.id)))
        .orderBy(asc(schema.billingTermin.no))
    : [];
  const byDeal = Map.groupBy(termins, (t) => t.dealId);
  return {
    deals: rows.map((r) => ({
      id: r.id,
      entity: r.entityCode,
      customer: r.customer,
      customerId: r.customerId,
      endCustomer: r.endCustomer,
      segment: r.segment,
      project: r.project,
      coaCode: r.coaCode,
      value: money(r.value).toFixed(),
      status: r.status,
      probability: money(r.probability).toFixed(),
      type: r.type,
      startMonth: r.startMonth,
      endMonth: r.endMonth,
      notes: r.notes,
      leadTimeMonths: r.leadTimeMonths,
      termins: (byDeal.get(r.id) ?? []).map((t) => ({ amount: money(t.amount).toFixed(), plannedDate: t.plannedOn, description: t.description })),
    })),
    targets: new Map(targets.map((t) => [t.segment, money(t.target)])),
    recovery: new Map(plans.map((p) => [p.segment, { plan: p.plan, updatedBy: p.updatedBy, updatedAt: p.updatedAt }])),
  };
}

/** The listed deals' termin against the invoices raised for them (plan E5). */
export async function loadTerminSchedule(dealIds: string[], year: number, today: string) {
  if (!dealIds.length) return terminSchedule([], [], year, today);
  const [termins, invoices] = await Promise.all([
    db.select().from(schema.billingTermin).where(inArray(schema.billingTermin.dealId, dealIds)),
    db
      .select({ dealId: schema.invoice.dealId, no: schema.invoice.terminNo, state: schema.invoice.state, dpp: schema.invoice.dpp, invoicedOn: schema.invoice.invoicedOn })
      .from(schema.invoice)
      .where(inArray(schema.invoice.dealId, dealIds)),
  ]);
  return terminSchedule(
    termins.map((t) => ({ dealId: t.dealId, no: t.no, plannedOn: t.plannedOn, amount: money(t.amount), description: t.description })),
    invoices.map((i) => ({ ...i, dpp: money(i.dpp) })),
    year,
    today,
  );
}
