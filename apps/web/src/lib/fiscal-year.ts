import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { pickYear } from "@estrada/domain";

export const YEAR_COOKIE = "tahun";

/** Every open or locked version's year, newest first, with the version list itself. Read once per request. */
export const yearVersions = cache(async () => {
  const versions = await db
    .select({ id: schema.budgetVersion.id, fiscalYear: schema.budgetVersion.fiscalYear, status: schema.budgetVersion.status, copiedFromId: schema.budgetVersion.copiedFromId })
    .from(schema.budgetVersion)
    .where(inArray(schema.budgetVersion.status, ["open", "locked"]));
  return { versions, years: [...new Set(versions.map((v) => v.fiscalYear))].sort((a, b) => b - a) };
});

/** The fiscal year every screen shows: the viewer's pick, else the newest year with an open version. */
export const activeYear = cache(async (): Promise<number | null> => {
  const [{ versions }, jar] = await Promise.all([yearVersions(), cookies()]);
  return pickYear(jar.get(YEAR_COOKIE)?.value, versions);
});
