import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { monthOf, postingProblem } from "@estrada/domain";
import { WorkflowError } from "./workflow";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** Held to the end of the transaction, so a month cannot close while something is being posted into it. */
export const lockPeriod = (tx: Tx, entity: string, year: number, month: number) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`period:${entity}:${year}:${month}`}))`);

/**
 * Every posting dated in a month goes through here, inside its transaction: refused when the PT's month is closed.
 * Returns a warning while the month is closing.
 */
export async function assertOpenPeriod(tx: Tx, entity: string, date: string): Promise<string | null> {
  const at = monthOf(date);
  if (!at) return null;
  await lockPeriod(tx, entity, at.year, at.month);
  const periods = await tx
    .select()
    .from(schema.fiscalPeriod)
    .where(and(eq(schema.fiscalPeriod.entityCode, entity), eq(schema.fiscalPeriod.year, at.year), eq(schema.fiscalPeriod.month, at.month)));
  const found = postingProblem(date, periods);
  if (!found) return null;
  const name = `${MONTH_NAMES[found.month - 1]} ${found.year} (${entity})`;
  if (found.blocked) throw new WorkflowError(`Periode ${name} sudah ditutup. Pakai tanggal pada periode yang terbuka, atau minta periode dibuka kembali.`);
  return `Perhatian: periode ${name} sedang ditutup.`;
}
