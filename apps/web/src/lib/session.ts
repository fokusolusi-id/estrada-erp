import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, or } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import type { Actor, Role } from "@estrada/domain";
import { auth } from "./auth";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  actor: Actor;
  positionTitle: string;
  activePositionId: string;
  /** All positions held, including acting (pjs), for the position switcher. */
  positions: { id: string; title: string; role: Role; orgUnit: string; acting: boolean }[];
}

/** Loads the session and the position the user is acting in. Redirects to /login when signed out. */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const rows = await db
    .select()
    .from(schema.position)
    .where(or(eq(schema.position.holderUserId, session.user.id), eq(schema.position.actingUserId, session.user.id)));

  const positions = rows.map((p) => ({
    id: p.id,
    title: p.title,
    role: p.role,
    orgUnit: p.orgUnitCode,
    acting: p.holderUserId !== session.user.id,
  }));
  const active = positions.find((p) => p.id === session.session.activePositionId) ?? positions[0];
  if (!active) redirect("/login?error=no_position");

  const scopes = await db
    .select({ entity: schema.positionEntityScope.entityCode })
    .from(schema.positionEntityScope)
    .where(eq(schema.positionEntityScope.positionId, active.id));

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    positionTitle: active.title,
    activePositionId: active.id,
    positions,
    actor: {
      userId: session.user.id,
      role: active.role,
      orgUnit: active.orgUnit,
      entities: scopes.length ? scopes.map((s) => s.entity) : ["ESTRADA"],
    },
  };
});
