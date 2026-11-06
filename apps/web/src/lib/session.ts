import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
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
  /** The signed-in user's own role. Differs from actor.role while an Admin is acting as another role. */
  realRole: Role;
  /** Admin only: every seat they may act as, and the one currently impersonated (null = themself). */
  viewAs: { options: { id: string; title: string; role: Role; orgUnit: string }[]; activeId: string | null } | null;
  positions: { id: string; title: string; role: Role; orgUnit: string; acting: boolean }[];
}

/** Loads the session and the position the user is acting in. Redirects to /login when signed out. */
export const VIEW_AS_COOKIE = "estrada_view_as";

export const requireUser = cache(async (): Promise<CurrentUser> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Admin needs every seat too; fetch both at once and keep the second only for admins (one round trip, not two).
  const [rows, allSeats] = await Promise.all([
    db
      .select()
      .from(schema.position)
      .where(or(eq(schema.position.holderUserId, session.user.id), eq(schema.position.actingUserId, session.user.id))),
    db.select().from(schema.position),
  ]);

  const positions = rows.map((p) => ({
    id: p.id,
    title: p.title,
    role: p.role,
    orgUnit: p.orgUnitCode,
    acting: p.holderUserId !== session.user.id,
  }));
  const active = positions.find((p) => p.id === session.session.activePositionId) ?? positions[0];
  if (!active) redirect("/login?error=no_position");

  const realRole = active.role;
  let acting = active;
  let viewAs: CurrentUser["viewAs"] = null;
  if (realRole === "admin") {
    const options = allSeats
      .filter((p) => p.role !== "admin")
      .map((p) => ({ id: p.id, title: p.title, role: p.role, orgUnit: p.orgUnitCode }))
      .sort((a, b) => a.role.localeCompare(b.role) || a.title.localeCompare(b.title));
    const wanted = (await cookies()).get(VIEW_AS_COOKIE)?.value;
    const target = options.find((o) => o.id === wanted);
    if (target) acting = { ...active, id: target.id, title: target.title, role: target.role, orgUnit: target.orgUnit };
    viewAs = { options, activeId: target?.id ?? null };
  }

  const scopes = await db
    .select({ entity: schema.positionEntityScope.entityCode })
    .from(schema.positionEntityScope)
    .where(eq(schema.positionEntityScope.positionId, acting.id));

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    positionTitle: acting.title,
    activePositionId: active.id,
    realRole,
    viewAs,
    positions,
    actor: {
      userId: session.user.id,
      role: acting.role,
      orgUnit: acting.orgUnit,
      entities: scopes.length ? scopes.map((s) => s.entity) : ["ESTRADA"],
    },
  };
});
