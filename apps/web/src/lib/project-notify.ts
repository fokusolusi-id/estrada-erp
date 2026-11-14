import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { PROJECT_NOTICES, projectRecipients, type ProjectEvent, type ProjectRecipient } from "@estrada/domain";
import { env } from "./env";
import { enqueueEmail } from "./email/outbox";
import type { ProjectRow } from "./implementasi";
import { loadSeats } from "./payment";
import { loadOrg } from "./workflow";

const ROLE_LABEL: Partial<Record<ProjectRecipient, string>> = { pm: "Project Manager", delivery_control: "Delivery Control", project_admin: "Project Admin" };

/** Which page a handoff lands on. */
const PAGE: Record<ProjectEvent, "" | "/serah-terima" | "/garansi"> = {
  team_assigned: "",
  rfs_declared: "",
  bast_prepared: "",
  bast_approved: "",
  handover_submitted: "/serah-terima",
  handover_returned: "/serah-terima",
  handover_accepted: "/serah-terima",
  defect_reported: "/garansi",
  defect_inherited: "/garansi",
};

/**
 * One email and one in-app notification per recipient per handoff (never per site, never with a rupiah figure).
 * A failure to notify never undoes the work already committed, so callers run this after their transaction.
 * `only` limits a team notice to the seats that changed.
 */
export async function notifyProject(event: ProjectEvent, project: Pick<ProjectRow, "id" | "name" | "entity" | "team">, actorId: string, opts: { comment?: string; only?: readonly ProjectRecipient[] } = {}) {
  try {
    const [org, seats] = await Promise.all([loadOrg(), loadSeats()]);
    const link = `/implementasi/${project.id}${PAGE[event]}`;
    const notices = PROJECT_NOTICES[event].filter((n) => !opts.only || opts.only.includes(n.to));
    // A person reached through two recipient kinds still gets the one email per template.
    const sent = new Set<string>();
    for (const notice of notices) {
      const ids = projectRecipients(notice.to, project, seats, org, actorId).filter((id) => !sent.has(`${notice.template}:${id}`));
      if (!ids.length) continue;
      const users = await db.select().from(schema.user).where(inArray(schema.user.id, ids));
      for (const u of users) {
        sent.add(`${notice.template}:${u.id}`);
        await enqueueEmail({
          template: notice.template,
          to: { userId: u.id, email: u.email, name: u.name },
          payload: {
            url: `${env.APP_URL}${link}`,
            project: project.name,
            entity: project.entity,
            ...(ROLE_LABEL[notice.to] ? { role: ROLE_LABEL[notice.to]! } : {}),
            ...(opts.comment ? { comment: opts.comment } : {}),
          },
        });
        await db.insert(schema.notification).values({ userId: u.id, template: notice.template, link });
      }
    }
  } catch (e) {
    console.error("notifyProject failed", event, e);
  }
}
