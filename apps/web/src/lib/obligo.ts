import "server-only";
import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { drawingOwed, drawingStatus, facilityPosition, money, type Actor, type EmailTemplate } from "@estrada/domain";
import { env } from "./env";
import { enqueueEmail } from "./email/outbox";
import { loadSeats, todayJakarta } from "./payment";

export const OBLIGO_LINK = "/obligo";
export const coversEntity = (actor: Actor, entity: string | null) => actor.entities.includes("*") || (!!entity && actor.entities.includes(entity));

/** One handoff email each, without amounts. */
export async function notifyObligo(template: EmailTemplate, userIds: readonly string[], payload: Record<string, string>) {
  if (!userIds.length) return;
  const users = await db.select().from(schema.user).where(inArray(schema.user.id, [...new Set(userIds)]));
  for (const u of users.filter((u) => u.active)) {
    await enqueueEmail({ template, to: { userId: u.id, email: u.email, name: u.name }, payload: { url: `${env.APP_URL}${OBLIGO_LINK}`, ...payload } });
    await db.insert(schema.notification).values({ userId: u.id, template, link: OBLIGO_LINK });
  }
}

export async function cashManagers(entity: string | null) {
  return (await loadSeats()).filter((s) => s.role === "cash_manager" && s.occupant && (!entity || s.entities.includes("*") || s.entities.includes(entity))).map((s) => s.occupant!);
}

/** Every facility with its position, its drawings and payments. */
export async function loadObligo(today = todayJakarta()) {
  const [facilities, drawings, payments] = await Promise.all([
    db.select().from(schema.bankFacility).orderBy(asc(schema.bankFacility.bankName), asc(schema.bankFacility.name)),
    db
      .select({ drawing: schema.facilityDrawing, pm: schema.project.pmUserId, project: schema.pipelineDeal.project })
      .from(schema.facilityDrawing)
      .leftJoin(schema.project, eq(schema.project.id, schema.facilityDrawing.projectId))
      .leftJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.project.dealId))
      .orderBy(desc(schema.facilityDrawing.createdAt)),
    db.select().from(schema.facilityPayment).where(isNull(schema.facilityPayment.reversedAt)).orderBy(desc(schema.facilityPayment.paidOn)),
  ]);
  const paid = payments.map((p) => ({ drawingId: p.drawingId, principal: money(p.principal) }));
  const amounts = drawings.map(({ drawing: d }) => ({ id: d.id, facilityId: d.facilityId, kind: d.kind, state: d.state, amount: money(d.amount) }));
  return {
    facilities: facilities.map((f) => ({ ...f, ...facilityPosition(money(f.plafon), amounts.filter((a) => a.facilityId === f.id), paid) })),
    drawings: drawings.map(({ drawing: d, pm, project }) => {
      const owed = drawingOwed({ id: d.id, kind: d.kind, state: d.state, amount: money(d.amount) }, paid);
      return { ...d, pm, project, owed, status: drawingStatus(d, owed, today) };
    }),
    payments,
  };
}
