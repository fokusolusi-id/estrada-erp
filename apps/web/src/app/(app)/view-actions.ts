"use server";

import { cookies } from "next/headers";
import { DIVISION_COOKIE, ENTITY_COOKIE, viewSetup } from "@/lib/view-filter";

const YEAR = 60 * 60 * 24 * 365;

/** Remembers the header's Entitas or Divisi. A preference only: no audit. An empty value or one not on offer is Semua. */
export async function setView(kind: "entity" | "division", value: string): Promise<void> {
  const { choices } = await viewSetup();
  const offered = kind === "entity" ? choices.entities : choices.divisions;
  const name = kind === "entity" ? ENTITY_COOKIE : DIVISION_COOKIE;
  const jar = await cookies();
  if (value && offered.includes(value)) jar.set(name, value, { path: "/", sameSite: "lax", maxAge: YEAR });
  else jar.delete(name);
}

/** Back to Semua entitas and Semua divisi. */
export async function resetView(): Promise<void> {
  await viewSetup();
  const jar = await cookies();
  jar.delete(ENTITY_COOKIE);
  jar.delete(DIVISION_COOKIE);
}
