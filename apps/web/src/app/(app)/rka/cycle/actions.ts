"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { can, nextVersionName, openCycleProblem, reviseProblem } from "@estrada/domain";
import { enqueueEmail } from "@/lib/email/outbox";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

export type CycleState = { ok: boolean; message: string; errors?: Record<string, string[]> };

async function requireFinance() {
  const user = await requireUser();
  return can(user.actor, "cycle.manage", null, await loadOrg()) ? user : null;
}
const DENIED: CycleState = { ok: false, message: "Hanya Finance yang dapat mengelola siklus RKA." };

/** A date picked in the form is the deadline at 17:00 WIB that day. */
const DEADLINE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pilih tanggal batas waktu")
  .transform((d) => new Date(`${d}T17:00:00+07:00`));

const formatDeadline = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(d) + " WIB";

/** Every requestor seat's holder or pjs, once each: the cycle email goes to them. */
async function emailRequestors(deadline: Date | null) {
  const seats = await db.select().from(schema.position).where(eq(schema.position.role, "requestor"));
  const ids = [...new Set(seats.map((p) => p.holderUserId ?? p.actingUserId).filter((x): x is string => !!x))];
  if (!ids.length) return 0;
  const users = await db.select().from(schema.user).where(inArray(schema.user.id, ids));
  for (const u of users) {
    await enqueueEmail({
      template: "cycle_opened",
      to: { userId: u.id, email: u.email, name: u.name },
      payload: { url: `${env.APP_URL}/rka`, ...(deadline ? { deadline: formatDeadline(deadline) } : {}) },
    });
    await db.insert(schema.notification).values({ userId: u.id, template: "cycle_opened", link: "/rka" });
  }
  return users.length;
}

const OpenSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2020).max(2100),
  name: z.string().trim().min(3, "Nama versi wajib diisi"),
  deadline: DEADLINE,
});

/** Finance opens the RKA cycle: an empty open version, and an email to every requestor. */
export async function openCycle(_prev: CycleState, form: FormData): Promise<CycleState> {
  const user = await requireFinance();
  if (!user) return DENIED;
  const parsed = OpenSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Periksa isian.", errors: z.flattenError(parsed.error).fieldErrors };
  const v = parsed.data;

  const versions = await db.select().from(schema.budgetVersion);
  if (openCycleProblem(v.fiscalYear, versions)) return { ok: false, message: `Sudah ada versi terbuka untuk ${v.fiscalYear}.` };
  if (versions.some((x) => x.name === v.name)) return { ok: false, message: `Nama versi "${v.name}" sudah dipakai.` };

  const [version] = await db
    .insert(schema.budgetVersion)
    .values({ fiscalYear: v.fiscalYear, name: v.name, submissionDeadline: v.deadline })
    .returning({ id: schema.budgetVersion.id });
  await db.insert(schema.auditLog).values({ actorUserId: user.id, action: "cycle.open", subjectType: "budget_version", subjectId: version!.id, after: v });
  await emailRequestors(v.deadline);

  // The form goes away once the year has an open version, so the page itself confirms.
  revalidatePath("/rka/cycle");
  redirect(`/rka/cycle?done=opened&v=${version!.id}`);
}

const DeadlineSchema = z.object({ versionId: z.string().uuid(), deadline: DEADLINE });

export async function setDeadline(_prev: CycleState, form: FormData): Promise<CycleState> {
  const user = await requireFinance();
  if (!user) return DENIED;
  const parsed = DeadlineSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Pilih tanggal batas waktu." };
  const [version] = await db.select().from(schema.budgetVersion).where(eq(schema.budgetVersion.id, parsed.data.versionId));
  if (version?.status !== "open") return { ok: false, message: "Batas waktu hanya untuk versi yang terbuka." };

  await db.transaction(async (tx) => {
    await tx.update(schema.budgetVersion).set({ submissionDeadline: parsed.data.deadline }).where(eq(schema.budgetVersion.id, version.id));
    await tx.insert(schema.auditLog).values({
      actorUserId: user.id,
      action: "cycle.deadline",
      subjectType: "budget_version",
      subjectId: version.id,
      before: { deadline: version.submissionDeadline },
      after: { deadline: parsed.data.deadline },
    });
  });
  revalidatePath("/rka/cycle");
  return { ok: true, message: `Batas waktu: ${formatDeadline(parsed.data.deadline)}.` };
}

const ReviseSchema = z.object({ versionId: z.string().uuid(), start: z.enum(["draft", "finance_review"]), deadline: z.union([DEADLINE, z.literal("")]).optional() });

/**
 * A revision copies a locked version into a new open one; the locked version is never touched.
 * Starting at draft sends every division through the flow again; starting at finance_review lets Finance adjust alone.
 */
export async function reviseVersion(_prev: CycleState, form: FormData): Promise<CycleState> {
  const user = await requireFinance();
  if (!user) return DENIED;
  const parsed = ReviseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const { versionId, start } = parsed.data;
  const deadline = parsed.data.deadline || null;

  const versions = await db.select().from(schema.budgetVersion);
  const base = versions.find((x) => x.id === versionId);
  if (!base) return { ok: false, message: "Versi tidak ditemukan." };
  const problem = reviseProblem(base, versions);
  if (problem === "not_locked") return { ok: false, message: "Hanya versi yang sudah dikunci yang bisa direvisi." };
  if (problem === "already_open") return { ok: false, message: `Sudah ada versi terbuka untuk ${base.fiscalYear}.` };
  const name = nextVersionName(base.name, versions.map((x) => x.name));

  const created = await db.transaction(async (tx) => {
    const [version] = await tx
      .insert(schema.budgetVersion)
      .values({ fiscalYear: base.fiscalYear, name, copiedFromId: base.id, submissionDeadline: deadline })
      .returning({ id: schema.budgetVersion.id });
    const lines = await tx.select().from(schema.budgetLine).where(eq(schema.budgetLine.versionId, base.id));
    if (lines.length) {
      const amounts = await tx.select().from(schema.budgetLineAmount).where(inArray(schema.budgetLineAmount.lineId, lines.map((l) => l.id)));
      const inserted = await tx
        .insert(schema.budgetLine)
        .values(
          lines.map((l) => ({
            versionId: version!.id,
            coaCode: l.coaCode,
            entityCode: l.entityCode,
            requestorUnit: l.requestorUnit,
            ownerUnit: l.ownerUnit,
            item: l.item,
            project: l.project,
            basis: l.basis,
            notes: l.notes,
            crossDivision: l.crossDivision,
            rka2026: l.rka2026,
            actual2026: l.actual2026,
            reviewFlags: l.reviewFlags,
            sourceRef: l.sourceRef,
            sharedBasis: l.sharedBasis,
            sharedFixed: l.sharedFixed,
            createdBy: l.createdBy,
            state: start,
          })),
        )
        .returning({ id: schema.budgetLine.id });
      const newId = new Map(lines.map((l, i) => [l.id, inserted[i]!.id]));
      if (amounts.length) await tx.insert(schema.budgetLineAmount).values(amounts.map((a) => ({ ...a, lineId: newId.get(a.lineId)! })));
    }
    const heads = await tx.select().from(schema.entityHeadcount).where(eq(schema.entityHeadcount.versionId, base.id));
    if (heads.length) await tx.insert(schema.entityHeadcount).values(heads.map((h) => ({ ...h, versionId: version!.id })));
    await tx.insert(schema.auditLog).values({
      actorUserId: user.id,
      action: "cycle.revise",
      subjectType: "budget_version",
      subjectId: version!.id,
      after: { from: base.name, name, lines: lines.length, start },
    });
    return version!.id;
  });
  if (start === "draft") await emailRequestors(deadline);

  revalidatePath("/rka/cycle");
  redirect(`/rka/cycle?done=revised&v=${created}`);
}
