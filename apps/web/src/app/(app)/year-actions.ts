"use server";

import { cookies } from "next/headers";
import { YEAR_COOKIE, yearVersions } from "@/lib/fiscal-year";
import { requireUser } from "@/lib/session";

/** Remembers which fiscal year the viewer is looking at. A preference only: no audit. */
export async function setFiscalYear(year: number): Promise<void> {
  await requireUser();
  const { years } = await yearVersions();
  if (!years.includes(year)) return;
  (await cookies()).set(YEAR_COOKIE, String(year), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}
