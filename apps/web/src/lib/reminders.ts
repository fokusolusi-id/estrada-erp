import "server-only";
import { and, eq, inArray, lt, lte, notInArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { deadlineReminderDay, obligoReminders, seatFor, type ApprovalState, type EmailTemplate, type Role } from "@estrada/domain";
import { enqueueEmail } from "./email/outbox";
import { cashManagers, loadObligo } from "./obligo";
import { escalate } from "./telkom";
import { env } from "./env";
import { approvalConfig, loadOrg } from "./workflow";

const DAY = 86_400_000;
const jakartaDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);

/** Records the reminder; false when that key was already sent, so a rerun never emails twice. */
async function claim(key: string): Promise<boolean> {
  const rows = await db.insert(schema.reminderLog).values({ key }).onConflictDoNothing().returning({ key: schema.reminderLog.key });
  return rows.length > 0;
}

async function send(template: EmailTemplate, userId: string, link: string, payload: Record<string, string>) {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
  if (!u?.active) return;
  await enqueueEmail({ template, to: { userId: u.id, email: u.email, name: u.name }, payload: { url: `${env.APP_URL}${link}`, ...payload } });
  await db.insert(schema.notification).values({ userId: u.id, template, link });
}

const QUEUE: Partial<Record<ApprovalState, { role: Role | "lock_role"; link: string }>> = {
  consolidation: { role: "default_owner", link: "/rka/queue" },
  division_approval: { role: "division_owner", link: "/rka/division" },
  finance_review: { role: "finance", link: "/rka/review" },
  awaiting_lock: { role: "lock_role", link: "/rka/lock" },
};

/**
 * The daily run: requestors with unsubmitted lines 7, 3 and 1 days before the deadline, and whoever holds
 * items waiting REMINDER_PENDING_DAYS or longer. One email per person per kind per day; vacant seats are
 * already Admin's (seat_vacant), so they are skipped here.
 */
export async function runReminders(now = new Date()) {
  const org = await loadOrg();
  const cfg = approvalConfig();
  const today = jakartaDay(now);
  const positions = await db.select().from(schema.position);
  const posForDomain = positions.map((p) => ({ orgUnit: p.orgUnitCode, role: p.role, holder: p.holderUserId, acting: p.actingUserId }));
  const holdersOf = (role: Role) =>
    positions.filter((p) => p.role === role).map((p) => p.holderUserId ?? p.actingUserId).filter((x): x is string => !!x);
  const versions = await db.select().from(schema.budgetVersion).where(eq(schema.budgetVersion.status, "open"));
  let deadline = 0;
  let pending = 0;

  for (const v of versions) {
    // Deadline: everyone in a requesting unit that still has drafts, plus whoever created them.
    const day = v.submissionDeadline ? deadlineReminderDay(v.submissionDeadline, now) : null;
    if (day !== null) {
      const drafts = await db
        .select({ unit: schema.budgetLine.requestorUnit, createdBy: schema.budgetLine.createdBy })
        .from(schema.budgetLine)
        .where(and(eq(schema.budgetLine.versionId, v.id), eq(schema.budgetLine.state, "draft")));
      const units = new Set(drafts.map((d) => d.unit));
      const users = new Set<string>(drafts.map((d) => d.createdBy).filter((x): x is string => !!x));
      for (const p of positions) {
        const who = p.holderUserId ?? p.actingUserId;
        if (p.role === "requestor" && who && units.has(p.orgUnitCode)) users.add(who);
      }
      for (const userId of users) {
        if (await claim(`deadline:${v.id}:${day}:${userId}`)) {
          await send("deadline_near", userId, "/rka", { days: String(day) });
          deadline += 1;
        }
      }
    }

    // Waiting too long: grouped per holder, one email listing the units.
    const stale = await db
      .select({ state: schema.budgetLine.state, ownerUnit: schema.budgetLine.ownerUnit })
      .from(schema.budgetLine)
      .where(
        and(
          eq(schema.budgetLine.versionId, v.id),
          notInArray(schema.budgetLine.state, ["draft", "locked"]),
          lt(schema.budgetLine.updatedAt, new Date(now.getTime() - env.REMINDER_PENDING_DAYS * DAY)),
        ),
      );
    const inbox = new Map<string, { units: Set<string>; count: number; link: string }>();
    for (const l of stale) {
      const q = QUEUE[l.state];
      if (!q) continue;
      const role: Role = q.role === "lock_role" ? cfg.lockRole : q.role;
      const who =
        role === "finance" || role === "director" ? holdersOf(role) : [seatFor(l.ownerUnit, role, posForDomain, org).holder].filter((x): x is string => !!x);
      for (const id of who) {
        const box = inbox.get(id) ?? { units: new Set<string>(), count: 0, link: q.link };
        box.units.add(l.ownerUnit);
        box.count += 1;
        inbox.set(id, box);
      }
    }
    for (const [userId, box] of inbox) {
      if (await claim(`pending:${v.id}:${userId}:${today}`)) {
        await send("reminder_pending", userId, box.link, { unit: [...box.units].join(", "), count: String(box.count), days: String(env.REMINDER_PENDING_DAYS) });
        pending += 1;
      }
    }
  }
  return { deadline, pending, obligo: await obligoAlerts(today), telkom: await escalate(today), risks: await riskReviews(today) };
}


/** Facility and guarantee expiry 30 days ahead, interest 7 days ahead, to Cash Management (BR-OBG-001, 005). */
async function obligoAlerts(today: string) {
  const { facilities, drawings } = await loadObligo(today);
  const live = facilities.filter((f) => f.active);
  const due = obligoReminders(
    today,
    live.map((f) => ({ id: f.id, expiresOn: f.expiresOn, interestDay: f.interestDay, owes: drawings.some((d) => d.facilityId === f.id && d.kind === "loan" && d.owed.gt(0)) })),
    drawings.filter((d) => d.kind === "bg" && d.state === "issued"),
  );
  let sent = 0;
  for (const r of due) {
    const guarantee = r.kind === "bg_expiry" ? drawings.find((d) => d.id === r.id) : undefined;
    const facility = facilities.find((f) => f.id === (guarantee?.facilityId ?? r.id))!;
    for (const userId of await cashManagers(guarantee?.entityCode ?? facility.entityCode)) {
      if (await claim(`obligo:${r.key}:${userId}`)) {
        await send(`obligo_${r.kind}`, userId, "/obligo", { facility: `${facility.bankName} ${facility.name}`, date: r.date });
        sent += 1;
      }
    }
  }
  return sent;
}

/** Owners of live risks whose review date has come: one email each per day, however many (P3-M3 rule 5). */
async function riskReviews(today: string) {
  const due = await db
    .select({ owner: schema.risk.ownerUserId })
    .from(schema.risk)
    .where(and(lte(schema.risk.nextReviewOn, today), inArray(schema.risk.status, ["identified", "in_progress", "mitigated"])));
  let sent = 0;
  for (const [owner, list] of Map.groupBy(due, (r) => r.owner)) {
    if (await claim(`risk:${owner}:${today}`)) {
      await send("risk_review", owner, "/risiko", { count: String(list.length) });
      sent += 1;
    }
  }
  return sent;
}
