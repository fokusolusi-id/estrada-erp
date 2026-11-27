"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { TAX_KINDS, TAX_STATUSES, can, money, parseIdr, taxDocumentProblem } from "@estrada/domain";
import { assertOpenPeriod } from "@/lib/period";
import { todayJakarta } from "@/lib/payment";
import { requireUser, type CurrentUser } from "@/lib/session";
import { loadOrg, WorkflowError } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const REFUSAL = "Data pajak dicatat oleh Accounting & Tax.";
const covers = (user: CurrentUser, entity: string) => user.actor.entities.includes("*") || user.actor.entities.includes(entity);

async function run(message: string, work: Parameters<typeof db.transaction>[0]): Promise<Result> {
  try {
    await db.transaction(work);
    revalidatePath("/pajak");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}

const Document = z.object({
  kind: z.enum(TAX_KINDS),
  sourceId: z.string().uuid("Dokumen tidak ditemukan."),
  number: z.string().trim().max(60),
  date: z.string().max(10),
  status: z.enum(TAX_STATUSES),
});
export type TaxDocumentInput = z.input<typeof Document>;

/** Records or corrects the number and status of a faktur or bukti potong. */
export async function saveTaxDocument(input: TaxDocumentInput): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "tax.record", null, await loadOrg())) return { ok: false, message: REFUSAL };
  const parsed = Document.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  const problem = taxDocumentProblem({ ...v, today: todayJakarta() });
  if (problem) return { ok: false, message: problem === "number" ? "Isi nomor dokumen pajak." : "Tanggal dokumen tidak boleh setelah hari ini." };
  const out = v.kind === "faktur_out";
  return run("Dokumen pajak disimpan.", async (tx) => {
    // The source is held so the same document is not recorded twice at once.
    const [source] = out
      ? await tx.select({ entity: schema.invoice.entityCode, state: schema.invoice.state, tax: schema.invoice.ppn }).from(schema.invoice).where(eq(schema.invoice.id, v.sourceId)).for("update")
      : await tx
          .select({ entity: schema.paymentRequest.entityCode, state: schema.paymentRequest.state, tax: v.kind === "bupot" ? schema.paymentRequest.pph : schema.paymentRequest.ppn })
          .from(schema.paymentRequest)
          .where(eq(schema.paymentRequest.id, v.sourceId))
          .for("update");
    const ready = source && (out ? source.state === "issued" : source.state !== "draft" && source.state !== "returned");
    if (!source || !ready || !covers(user, source.entity) || !money(source.tax).gt(0)) throw new WorkflowError("Dokumen tidak ditemukan.");
    const column = out ? schema.taxDocument.invoiceId : schema.taxDocument.paymentId;
    const [before] = await tx.select().from(schema.taxDocument).where(and(eq(schema.taxDocument.kind, v.kind), eq(column, v.sourceId)));
    const values = { number: v.number, documentDate: v.date, status: v.status, updatedBy: user.id, updatedAt: new Date() };
    let id = before?.id;
    if (before) await tx.update(schema.taxDocument).set(values).where(eq(schema.taxDocument.id, before.id));
    else {
      const link = out ? { invoiceId: v.sourceId } : { paymentId: v.sourceId };
      const [row] = await tx.insert(schema.taxDocument).values({ kind: v.kind, ...link, ...values }).returning({ id: schema.taxDocument.id });
      id = row!.id;
    }
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "tax.document", subjectType: "tax_document", subjectId: id!, before: before ?? null, after: { kind: v.kind, sourceId: v.sourceId, ...values } });
  });
}

const Pph21 = z.object({ entityCode: z.string().min(1).max(20), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pilih bulan."), amount: z.string().max(40) });

export async function savePph21(input: z.input<typeof Pph21>): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "tax.record", null, await loadOrg())) return { ok: false, message: REFUSAL };
  const parsed = Pph21.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  let amount;
  try {
    amount = parseIdr(v.amount);
  } catch {
    return { ok: false, message: "Nominal tidak terbaca." };
  }
  if (amount.isNegative()) return { ok: false, message: "Nominal tidak boleh negatif." };
  if (v.period > todayJakarta().slice(0, 7)) return { ok: false, message: "Bulan belum berjalan." };
  if (!covers(user, v.entityCode)) return { ok: false, message: "Entitas tidak dikenal." };
  const [year, month] = [Number(v.period.slice(0, 4)), Number(v.period.slice(5, 7))];
  return run("PPh 21 disimpan.", async (tx) => {
    const [entity] = await tx.select().from(schema.companyEntity).where(eq(schema.companyEntity.code, v.entityCode));
    if (!entity) throw new WorkflowError("Entitas tidak dikenal.");
    await assertOpenPeriod(tx, v.entityCode, `${v.period}-01`);
    const key = and(eq(schema.taxPph21.entityCode, v.entityCode), eq(schema.taxPph21.year, year), eq(schema.taxPph21.month, month));
    const [before] = await tx.select().from(schema.taxPph21).where(key);
    const values = { entityCode: v.entityCode, year, month, amount: amount.toFixed(2), updatedBy: user.id, updatedAt: new Date() };
    await tx.insert(schema.taxPph21).values(values).onConflictDoUpdate({ target: [schema.taxPph21.entityCode, schema.taxPph21.year, schema.taxPph21.month], set: values });
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "tax.pph21", subjectType: "tax_pph21", subjectId: `${v.entityCode}:${v.period}`, before: before ?? null, after: values });
  });
}
