"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { can, commentProblem, COMMENT_MAX } from "@estrada/domain";
import { notifyComment } from "@/lib/comments";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

export type CommentResult = { ok: boolean; message: string };

const CommentInput = z.object({ lineId: z.string().uuid(), body: z.string() });

/** Posts a comment on a line. Asking never moves the line; returns and clarifications stay in the approval flow. */
export async function addComment(lineId: string, body: string): Promise<CommentResult> {
  const user = await requireUser();
  const parsed = CommentInput.safeParse({ lineId, body });
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };

  const problem = commentProblem(parsed.data.body);
  if (problem === "empty") return { ok: false, message: "Tulis komentar terlebih dahulu." };
  if (problem === "too_long") return { ok: false, message: `Komentar maksimal ${COMMENT_MAX} karakter.` };

  const [row] = await db
    .select({ line: schema.budgetLine, versionStatus: schema.budgetVersion.status })
    .from(schema.budgetLine)
    .innerJoin(schema.budgetVersion, eq(schema.budgetVersion.id, schema.budgetLine.versionId))
    .where(eq(schema.budgetLine.id, parsed.data.lineId));
  const org = await loadOrg();
  const line = row?.line;
  const res = line ? { requestorUnit: line.requestorUnit, ownerUnit: line.ownerUnit, entity: line.entityCode, state: line.state } : null;
  if (!line || row.versionStatus !== "open" || !can(user.actor, "line.comment", res, org)) {
    return { ok: false, message: "Anda tidak dapat berkomentar pada baris ini." };
  }

  const text = parsed.data.body.trim();
  await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(schema.lineComment)
      .values({ lineId: line.id, authorUserId: user.id, authorRole: user.actor.role, body: text })
      .returning({ id: schema.lineComment.id });
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "line.comment", subjectType: "budget_line", subjectId: line.id, after: { commentId: c!.id } });
  });
  await notifyComment(user, line, org);

  revalidatePath(`/rka/line/${line.id}`);
  return { ok: true, message: "Komentar terkirim." };
}
