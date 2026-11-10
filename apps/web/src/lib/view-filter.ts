import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { inView, pickView, repeatedColumns, viewChoices, type HiddenColumns, type ViewChoices, type ViewFilter } from "@estrada/domain";
import { requireUser } from "./session";
import { loadOrg } from "./workflow";

export const ENTITY_COOKIE = "entitas";
export const DIVISION_COOKIE = "divisi";

/** What the header offers this position and what it has picked; read once per request. */
export const viewSetup = cache(async (): Promise<{ choices: ViewChoices; view: ViewFilter }> => {
  const [user, org, jar, rows] = await Promise.all([
    requireUser(),
    loadOrg(),
    cookies(),
    db.select({ code: schema.companyEntity.code, costType: schema.companyEntity.costType }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
  ]);
  // ESTRADA (indirect) first, as the workbook lists entities.
  const entities = [...rows.filter((e) => e.costType === "indirect"), ...rows.filter((e) => e.costType !== "indirect")].map((e) => e.code);
  const choices = viewChoices(user.actor, entities, org);
  return { choices, view: pickView({ entity: jar.get(ENTITY_COOKIE)?.value, division: jar.get(DIVISION_COOKIE)?.value }, choices) };
});

/** The header's Entitas and Divisi. */
export async function activeView(): Promise<ViewFilter> {
  return (await viewSetup()).view;
}

/** Keeps the lines the header's Entitas and Divisi point at. */
export async function viewLines<L extends { entity: string; ownerUnit: string }>(lines: readonly L[]): Promise<L[]> {
  const [view, org] = await Promise.all([activeView(), loadOrg()]);
  return lines.filter(inView(view, org));
}

/** Columns these lines would repeat on every row under the header's view. */
export async function hiddenColumns(lines: readonly { entity: string; ownerUnit: string }[]): Promise<HiddenColumns> {
  return repeatedColumns(await activeView(), lines);
}
