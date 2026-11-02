"use server";

import { cookies } from "next/headers";
import { parseUnit, type Unit } from "@estrada/domain";
import { UNIT_COOKIE } from "@/lib/display-unit";
import { requireUser } from "@/lib/session";

/** Remembers the viewer's display unit. A preference only: no audit, no effect on stored amounts. */
export async function setDisplayUnit(unit: Unit): Promise<void> {
  await requireUser();
  (await cookies()).set(UNIT_COOKIE, parseUnit(unit), { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}
