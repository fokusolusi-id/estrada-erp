import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { activeView } from "./view-filter";
import { reportVersions } from "./rka";
import { todayJakarta } from "./payment";
import type { CurrentUser } from "./session";

/** The month and companies a BOD screen shows: the asked month, else the current one within the RKA year. */
export async function bodScope(user: CurrentUser, asked: string | undefined) {
  const today = todayJakarta();
  const [view, [version], companies] = await Promise.all([
    activeView(),
    reportVersions(),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
  ]);
  const fallback = version && String(version.fiscalYear) !== today.slice(0, 4) ? `${version.fiscalYear}-${version.fiscalYear < Number(today.slice(0, 4)) ? "12" : "01"}` : today.slice(0, 7);
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked ?? "") ? asked! : fallback;
  const mine = companies.map((c) => c.code).filter((c) => user.actor.entities.includes("*") || user.actor.entities.includes(c));
  const entities = view.entity && mine.includes(view.entity) ? [view.entity] : mine;
  return { today, period, year: Number(period.slice(0, 4)), month: Number(period.slice(5, 7)), entities, scope: entities.join("+") };
}
