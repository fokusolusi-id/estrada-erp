import { cookies } from "next/headers";
import { parseUnit, type Unit } from "@estrada/domain";

export const UNIT_COOKIE = "satuan";

/** The unit this viewer picked for amounts on screen; juta until they pick one. */
export async function displayUnit(): Promise<Unit> {
  return parseUnit((await cookies()).get(UNIT_COOKIE)?.value);
}
