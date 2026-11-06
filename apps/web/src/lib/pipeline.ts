import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { money, type DealInput, type Money } from "@estrada/domain";
import { reportVersions } from "./rka";

/** The Pipeline register follows the RKA being reported: the open version's year, else the latest locked one's. */
export async function pipelineYear(): Promise<number | null> {
  const [version] = await reportVersions();
  return version?.fiscalYear ?? null;
}

export async function loadPipeline(fiscalYear: number): Promise<{ deals: (DealInput & { id: string })[]; targets: Map<string, Money> }> {
  const [rows, targets] = await Promise.all([
    db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.fiscalYear, fiscalYear)).orderBy(asc(schema.pipelineDeal.createdAt), asc(schema.pipelineDeal.sourceRef)),
    db.select().from(schema.pipelineTarget).where(eq(schema.pipelineTarget.fiscalYear, fiscalYear)),
  ]);
  return {
    deals: rows.map((r) => ({
      id: r.id,
      entity: r.entityCode,
      customer: r.customer,
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
    })),
    targets: new Map(targets.map((t) => [t.segment, money(t.target)])),
  };
}
