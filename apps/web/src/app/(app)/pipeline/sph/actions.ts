"use server";

import { revalidatePath } from "next/cache";
import { and, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { SPH_ACTIONS, canPipeline, isLost, parseIdr, sphNumber, sphProblem, sphStep, type EmailTemplate, type SphAction } from "@estrada/domain";
import { env } from "@/lib/env";
import { enqueueEmail } from "@/lib/email/outbox";
import { loadSeats, todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg, WorkflowError } from "@/lib/workflow";

type Result = { ok: boolean; message: string };
type Row = typeof schema.sph.$inferSelect;

const MESSAGE = { amount: "Isi harga penawaran lebih dari 0 dan COGS 0 atau lebih.", date: "Tanggal SPH tidak boleh sesudah hari ini." };
const Form = z.object({
  id: z.string().uuid().nullable(),
  dealId: z.string().uuid("Pilih deal."),
  issuedOn: z.string().max(10),
  price: z.string().max(40),
  cogs: z.string().max(40),
  description: z.string().trim().min(5, "Tulis uraian penawaran.").max(1000),
});
export type SphInput = z.input<typeof Form>;

/** One email per handoff, without amounts: Pricing, then the approver, then back to the writer. */
async function tell(row: Row, comment?: string) {
  const template = ({ pricing: "sph_review", approval: "sph_approval", approved: "sph_approved", returned: "sph_returned" } as const)[row.state] satisfies EmailTemplate;
  const covers = (entities: readonly string[]) => entities.includes("*") || entities.includes(row.entityCode);
  const headWrote = row.createdRole === "division_owner" && row.createdUnit === "BCD";
  const seats = await loadSeats();
  const ids =
    row.state === "approved" || row.state === "returned"
      ? [row.createdBy]
      : seats
          .filter((s) => covers(s.entities) && (row.state === "pricing" ? s.role === "bfp" : headWrote ? s.role === "director" : s.role === "division_owner" && s.orgUnit === "BCD"))
          .flatMap((s) => (s.occupant && s.occupant !== row.createdBy ? [s.occupant] : []));
  for (const userId of new Set(ids)) {
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
    if (!u?.active) continue;
    await enqueueEmail({ template, to: { userId: u.id, email: u.email, name: u.name }, payload: { url: `${env.APP_URL}/pipeline/sph`, number: row.number, entity: row.entityCode, ...(comment ? { comment } : {}) } });
    await db.insert(schema.notification).values({ userId: u.id, template, link: "/pipeline/sph" });
  }
}

/** Writes a new SPH with the next number, or changes a returned one. Sales (BCD) only, within its companies. */
export async function saveSph(input: SphInput): Promise<Result> {
  const user = await requireUser();
  const parsed = Form.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian SPH." };
  const v = parsed.data;
  const org = await loadOrg();
  const [deal] = await db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.id, v.dealId));
  if (!deal || !canPipeline(user.actor, "edit", deal.entityCode, org)) return { ok: false, message: "SPH dibuat Sales (BCD) untuk entitasnya." };
  if (isLost(deal.status)) return { ok: false, message: "Deal ini sudah Drop atau Cancel." };
  let price, cogs;
  try {
    [price, cogs] = [parseIdr(v.price), parseIdr(v.cogs || "0")];
  } catch {
    return { ok: false, message: "Nominal tidak terbaca." };
  }
  const problem = sphProblem({ price, cogs, issuedOn: v.issuedOn, today: todayJakarta() });
  if (problem) return { ok: false, message: MESSAGE[problem] };
  const values = { issuedOn: v.issuedOn, price: price.toFixed(2), cogs: cogs.toFixed(2), description: v.description, updatedAt: new Date() };
  try {
    const row = await db.transaction(async (tx) => {
      if (v.id) {
        const [before] = await tx.select().from(schema.sph).where(eq(schema.sph.id, v.id)).for("update");
        if (!before || before.dealId !== deal.id || before.state !== "returned") throw new WorkflowError("Hanya SPH yang dikembalikan dapat diubah.");
        await tx.update(schema.sph).set(values).where(eq(schema.sph.id, before.id));
        await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "sph.update", subjectType: "sph", subjectId: before.id, before, after: values });
        return null;
      }
      // The next number for the company and year, held until the SPH is written.
      const prefix = sphNumber(deal.entityCode, v.issuedOn, 0).slice(0, -4);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`);
      const [last] = await tx.select({ max: sql<string | null>`max(${schema.sph.number})` }).from(schema.sph).where(like(schema.sph.number, `${prefix}%`));
      const record = {
        ...values,
        number: sphNumber(deal.entityCode, v.issuedOn, last?.max ? Number(last.max.slice(-4)) + 1 : 1),
        dealId: deal.id,
        entityCode: deal.entityCode,
        createdBy: user.id,
        createdRole: user.actor.role,
        createdUnit: user.actor.orgUnit,
      };
      const [created] = await tx.insert(schema.sph).values(record).returning();
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "sph.create", subjectType: "sph", subjectId: created!.id, after: record });
      return created!;
    });
    if (row) await tell(row);
    revalidatePath("/pipeline/sph");
    return { ok: true, message: row ? `${row.number} dikirim ke Pricing.` : "SPH disimpan. Kirim ulang bila sudah sesuai." };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function runSphAction(id: string, action: SphAction, note: string): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ id: z.string().uuid(), action: z.enum(SPH_ACTIONS), note: z.string().trim().max(500) }).safeParse({ id, action, note });
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const v = parsed.data;
  const org = await loadOrg();
  try {
    const row = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.sph).where(eq(schema.sph.id, v.id)).for("update");
      if (!before) throw new WorkflowError("SPH tidak ditemukan.");
      const step = sphStep({ ...before, entity: before.entityCode }, v.action, user.actor, org, v.note);
      if ("problem" in step) throw new WorkflowError(step.problem === "note_required" ? "Tulis alasan pengembalian." : "Anda tidak berwenang atas langkah ini.");
      const patch = {
        state: step.to,
        updatedAt: new Date(),
        ...(v.action === "review" ? { reviewedBy: user.id } : {}),
        ...(v.action === "approve" ? { approvedBy: user.id } : {}),
        ...(v.action === "return" ? { note: v.note } : {}),
        ...(v.action === "resubmit" ? { reviewedBy: null, note: null } : {}),
      };
      await tx.update(schema.sph).set(patch).where(and(eq(schema.sph.id, before.id)));
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: `sph.${v.action}`, subjectType: "sph", subjectId: before.id, before: { state: before.state }, after: { state: step.to, ...(v.note ? { note: v.note } : {}) } });
      return { ...before, ...patch } as Row;
    });
    await tell(row, v.action === "return" ? v.note : undefined);
    revalidatePath("/pipeline/sph");
    return { ok: true, message: `${row.number} diperbarui.` };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}
