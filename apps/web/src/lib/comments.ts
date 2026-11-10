import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { ROLE_LABEL, commentAudience, commentEmailDue, seatFor, type CommentedLine, type OrgTree, type Role } from "@estrada/domain";
import type { ThreadComment } from "@/components/erp/comment-thread";
import type { CurrentUser } from "./session";
import { loadScopedLines } from "./rka";
import { approvalConfig } from "./workflow";
import { enqueueEmail } from "./email/outbox";
import { env } from "./env";

/** One line with its thread, if this position may see it; null otherwise (the page answers 404). */
export async function loadLineDetail(user: CurrentUser, lineId: string) {
  const [row] = await db
    .select({
      versionId: schema.budgetLine.versionId,
      versionName: schema.budgetVersion.name,
      versionStatus: schema.budgetVersion.status,
      fiscalYear: schema.budgetVersion.fiscalYear,
    })
    .from(schema.budgetLine)
    .innerJoin(schema.budgetVersion, eq(schema.budgetVersion.id, schema.budgetLine.versionId))
    .where(eq(schema.budgetLine.id, lineId));
  if (!row) return null;
  const [line] = await loadScopedLines(user, undefined, row.versionId, lineId);
  if (!line) return null;
  return {
    line,
    version: { id: row.versionId, name: row.versionName, status: row.versionStatus, fiscalYear: row.fiscalYear },
    comments: await loadThread(lineId),
  };
}

export async function loadThread(lineId: string): Promise<ThreadComment[]> {
  const rows = await db
    .select({ c: schema.lineComment, name: schema.user.name })
    .from(schema.lineComment)
    .innerJoin(schema.user, eq(schema.user.id, schema.lineComment.authorUserId))
    .where(eq(schema.lineComment.lineId, lineId))
    .orderBy(asc(schema.lineComment.createdAt));
  return rows.map(({ c, name }) => ({ id: c.id, authorName: name, authorRole: ROLE_LABEL[c.authorRole], body: c.body, at: c.createdAt.toISOString() }));
}

/**
 * Tells the requestor, the line's current holder and everyone in the thread about a new comment.
 * Each gets an in-app notification; an email goes out at most once an hour per person, without the comment text.
 */
export async function notifyComment(
  author: CurrentUser,
  line: CommentedLine & { id: string; coaCode: string; item: string | null },
  org: OrgTree,
) {
  const earlier = await db.selectDistinct({ id: schema.lineComment.authorUserId }).from(schema.lineComment).where(eq(schema.lineComment.lineId, line.id));
  const positions = await db.select().from(schema.position);
  const posForDomain = positions.map((p) => ({ orgUnit: p.orgUnitCode, role: p.role, holder: p.holderUserId, acting: p.actingUserId }));
  const holdersOf = (role: Role) => positions.filter((p) => p.role === role).map((p) => p.holderUserId ?? p.actingUserId).filter((x): x is string => !!x);

  const to = new Set<string>();
  for (const r of commentAudience(line, earlier.map((e) => e.id), approvalConfig())) {
    if (r.kind === "user") to.add(r.userId);
    else if (r.kind === "role") holdersOf(r.role).forEach((id) => to.add(id));
    else {
      // A vacant seat is already reported to Admin by the approval flow; the comment waits on the line.
      const seat = seatFor(r.unit, r.role, posForDomain, org);
      if (seat.holder) to.add(seat.holder);
    }
  }
  to.delete(author.id);
  if (!to.size) return;

  const link = `/rka/line/${line.id}`;
  const label = `baris ${line.coaCode}${line.item ? ` "${line.item}"` : ""} · ${line.ownerUnit}`;
  const users = await db.select().from(schema.user).where(inArray(schema.user.id, [...to]));
  const now = new Date();
  for (const u of users) {
    await db.insert(schema.notification).values({ userId: u.id, template: "line_comment", link });
    const [last] = await db
      .select({ at: schema.emailOutbox.createdAt })
      .from(schema.emailOutbox)
      .where(and(eq(schema.emailOutbox.toUserId, u.id), eq(schema.emailOutbox.template, "line_comment")))
      .orderBy(desc(schema.emailOutbox.createdAt))
      .limit(1);
    if (!commentEmailDue(last?.at ?? null, now)) continue;
    await enqueueEmail({
      template: "line_comment",
      to: { userId: u.id, email: u.email, name: u.name },
      payload: { url: `${env.APP_URL}${link}`, author: author.name, role: ROLE_LABEL[author.actor.role], line: label },
    });
  }
}
