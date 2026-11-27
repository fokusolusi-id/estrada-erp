"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { canNoteVariance } from "@estrada/domain";
import { reportVersions } from "@/lib/rka";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

/** Adds a root-cause note to a cost center, or to one of its accounts, on the approved budget. */
export async function saveVarianceNote(unit: string, coaCode: string | null, note: string): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ unit: z.string().min(1).max(40), coaCode: z.string().max(20).nullable(), note: z.string().trim().min(10).max(2000) }).safeParse({ unit, coaCode, note });
  if (!parsed.success) return { ok: false, message: "Tulis penyebabnya, minimal 10 karakter." };
  if (!canNoteVariance(user.actor, parsed.data.unit, await loadOrg())) return { ok: false, message: "Catatan varians ditulis pemilik cost center." };
  const versions = await reportVersions();
  const version = versions.find((v) => v.status === "locked") ?? versions[0];
  if (!version) return { ok: false, message: "Belum ada siklus RKA." };
  const [line] = await db
    .select({ id: schema.budgetLine.id })
    .from(schema.budgetLine)
    .where(
      and(
        eq(schema.budgetLine.versionId, version.id),
        eq(schema.budgetLine.ownerUnit, parsed.data.unit),
        parsed.data.coaCode ? eq(schema.budgetLine.coaCode, parsed.data.coaCode) : undefined,
      ),
    )
    .limit(1);
  if (!line) return { ok: false, message: "Tidak ada anggaran untuk cost center atau COA ini." };

  const values = { versionId: version.id, unitCode: parsed.data.unit, coaCode: parsed.data.coaCode, note: parsed.data.note, authorId: user.id };
  await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.varianceNote).values(values).returning({ id: schema.varianceNote.id });
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "variance.note", subjectType: "variance_note", subjectId: row!.id, after: values });
  });
  revalidatePath("/rka/variance");
  return { ok: true, message: "Catatan disimpan." };
}
