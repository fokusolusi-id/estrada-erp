import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { TELKOM_STAGES, dueTier, escalationRecipients, stagePosition } from "@estrada/domain";
import { env } from "./env";
import { enqueueEmail } from "./email/outbox";
import { loadSeats } from "./payment";
import { loadOrg } from "./workflow";

/** TELKOM-scheme projects with where each stands in the billing stages. */
export async function loadTracker(today: string) {
  const [projects, tracks, done, obstacles, assurance, escalations] = await Promise.all([
    db
      .select({ id: schema.project.id, status: schema.project.status, telkom: schema.project.telkomScheme, name: schema.pipelineDeal.project, entity: schema.pipelineDeal.entityCode })
      .from(schema.project)
      .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.project.dealId))
      .orderBy(asc(schema.pipelineDeal.project)),
    db.select().from(schema.billingTrack),
    db.select().from(schema.billingStage).orderBy(asc(schema.billingStage.stage)),
    db.select().from(schema.billingObstacle).orderBy(desc(schema.billingObstacle.createdAt)),
    db.select().from(schema.billingAssurance),
    db.select().from(schema.billingEscalation),
  ]);
  return projects
    .filter((p) => p.telkom || tracks.some((t) => t.projectId === p.id))
    .map((p) => {
      const track = tracks.find((t) => t.projectId === p.id);
      const stages = done.filter((d) => d.projectId === p.id);
      const position = track ? stagePosition(track.startedOn, stages) : null;
      const current = position?.current ? TELKOM_STAGES[position.current - 1]! : null;
      return {
        ...p,
        startedOn: track?.startedOn ?? null,
        stages,
        position,
        tier: position && current ? dueTier(position.deadline, current.slaDays, today) : 0,
        obstacles: obstacles.filter((o) => o.projectId === p.id),
        assurance: assurance.filter((a) => a.projectId === p.id),
        escalations: escalations.filter((e) => e.projectId === p.id),
      };
    });
}

/** Records each tier a late stage has newly reached and emails the highest one's people (the daily run). */
export async function escalate(today: string) {
  const [tracked, seats, org] = await Promise.all([loadTracker(today), loadSeats(), loadOrg()]);
  let sent = 0;
  for (const p of tracked) {
    const at = p.position;
    // A dropped or closed project is no longer chased.
    if (!at?.current || !p.tier || p.status === "Drop" || p.status === "Closing") continue;
    let newest = 0;
    for (let tier = 1; tier <= p.tier; tier++) {
      const added = await db.insert(schema.billingEscalation).values({ projectId: p.id, stage: at.current, tier, deadline: at.deadline! }).onConflictDoNothing().returning({ tier: schema.billingEscalation.tier });
      if (added.length) newest = tier;
    }
    if (!newest) continue;
    const stage = TELKOM_STAGES[at.current - 1]!;
    for (const userId of escalationRecipients(at.current, newest, p.entity, seats, org)) {
      const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
      if (!u?.active) continue;
      await enqueueEmail({ template: "telkom_escalation", to: { userId: u.id, email: u.email, name: u.name }, payload: { url: `${env.APP_URL}/tracker-telkom?proyek=${p.id}`, project: p.name, stage: stage.name, tier: String(newest) } });
      await db.insert(schema.notification).values({ userId: u.id, template: "telkom_escalation", link: `/tracker-telkom?proyek=${p.id}` });
      sent += 1;
    }
  }
  return sent;
}
