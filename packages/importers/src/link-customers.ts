import { eq, isNull } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { matchCustomer } from "@estrada/domain";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Links deals that have no customer yet to Master Customer by name. The deal's text is left as written. */
export async function linkDealCustomers(conn: Db): Promise<{ linked: number; unmatched: string[] }> {
  const customers = await conn
    .select({ id: schema.customer.id, nickname: schema.customer.nickname, legalName: schema.customer.legalName })
    .from(schema.customer)
    .where(eq(schema.customer.active, true));
  const deals = await conn.select({ id: schema.pipelineDeal.id, customer: schema.pipelineDeal.customer }).from(schema.pipelineDeal).where(isNull(schema.pipelineDeal.customerId));

  let linked = 0;
  const unmatched: string[] = [];
  for (const d of deals) {
    const customerId = matchCustomer(d.customer, customers);
    if (!customerId) {
      unmatched.push(d.customer);
      continue;
    }
    await conn.update(schema.pipelineDeal).set({ customerId }).where(eq(schema.pipelineDeal.id, d.id));
    linked++;
  }
  return { linked, unmatched };
}

export function linkSummary({ linked, unmatched }: { linked: number; unmatched: string[] }): string {
  const names = [...new Set(unmatched)].join(", ");
  return `Pipeline: ${linked} deal terhubung ke Master Customer, ${unmatched.length} perlu dirapikan BCD${names ? ` (${names})` : ""}.`;
}
