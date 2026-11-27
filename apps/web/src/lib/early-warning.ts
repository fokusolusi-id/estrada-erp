import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { REOPEN_DAYS, escalationLevel, escalationTargets, evaluateRules, ewRule, ruleRecipients } from "@estrada/domain";
import { loadEwFigures } from "./early-warning-figures";
import { env } from "./env";
import { enqueueEmail } from "./email/outbox";
import { loadSeats, todayJakarta } from "./payment";
import { loadOrg } from "./workflow";

export const EW_LINK = "/peringatan";
const live = (status: string) => status === "open" || status === "acknowledged";

/**
 * Judges every rule once: opens new alerts, refreshes or clears live ones and escalates the unanswered.
 * Each person gets one message per kind for the whole run, never one per alert.
 */
export async function runEarlyWarning(today = todayJakarta()) {
  const org = await loadOrg();
  const [figures, seats, alerts] = await Promise.all([loadEwFigures(today, org), loadSeats(), db.select().from(schema.earlyWarning).orderBy(desc(schema.earlyWarning.firedOn))]);
  const fresh = new Map<string, number>();
  const mailed = new Set<string>();
  const escalated = new Map<string, number>();
  const count = (map: Map<string, number>, ids: readonly string[]) => ids.forEach((id) => map.set(id, (map.get(id) ?? 0) + 1));
  const done = { opened: 0, cleared: 0, escalated: 0 };

  for (const result of evaluateRules(figures)) {
    const rule = ewRule(result.code)!;
    const mine = alerts.filter((a) => a.rule === result.code && a.subject === result.subject);
    const current = mine.find((a) => live(a.status));
    // Without data a live alert stays: silence is not recovery.
    if (result.fired === null) continue;
    if (current) {
      if (!result.fired) {
        await db.update(schema.earlyWarning).set({ status: "cleared", closedOn: today, detail: result.detail, updatedAt: new Date() }).where(eq(schema.earlyWarning.id, current.id));
        done.cleared++;
        continue;
      }
      const level = current.status === "open" ? escalationLevel(rule.severity, current.firedOn, today) : 0;
      let assignees = current.assignees;
      if (level > current.level) {
        const up = escalationTargets(level as 1 | 2, seats, org);
        assignees = [...new Set([...assignees, ...up])];
        count(escalated, up);
        done.escalated++;
      }
      await db.update(schema.earlyWarning).set({ detail: result.detail, level: Math.max(level, current.level), assignees, updatedAt: new Date() }).where(eq(schema.earlyWarning.id, current.id));
      continue;
    }
    if (!result.fired) continue;
    const closed = mine[0];
    if (closed && closed.status !== "cleared" && closed.closedOn && Date.parse(today) - Date.parse(closed.closedOn) < REOPEN_DAYS * 86_400_000) continue;
    const assignees = ruleRecipients(result.code, result.subject, seats, org);
    const added = await db.insert(schema.earlyWarning).values({ rule: result.code, subject: result.subject, firedOn: today, detail: result.detail, assignees }).onConflictDoNothing().returning({ id: schema.earlyWarning.id });
    if (!added.length) continue;
    count(fresh, assignees);
    if (rule.email) assignees.forEach((id) => mailed.add(id));
    done.opened++;
  }

  for (const [template, map] of [["ew_alert", fresh], ["ew_escalated", escalated]] as const) {
    for (const [userId, n] of map) {
      const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
      if (!u?.active) continue;
      if (template === "ew_escalated" || mailed.has(userId)) await enqueueEmail({ template, to: { userId: u.id, email: u.email, name: u.name }, payload: { url: `${env.APP_URL}${EW_LINK}`, count: String(n) } });
      await db.insert(schema.notification).values({ userId: u.id, template, link: EW_LINK });
    }
  }
  return done;
}
