"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { KPI_ACTIONS, canEditKpi, documentProblem, kpiProblem, kpiStep, money, parseIdr, type KpiAction } from "@estrada/domain";
import { env } from "@/lib/env";
import { enqueueEmail } from "@/lib/email/outbox";
import { targetsOf } from "@/lib/kpi";
import { loadSeats } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { putFile } from "@/lib/storage";
import { WorkflowError } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const PROBLEM = {
  revenue: "Target revenue harus lebih dari 0.",
  cash_in: "Target cash-in harus lebih dari 0.",
  percent: "Persentase harus 0 sampai 100.",
  direct: "Bagian Direct tidak boleh melebihi target revenue.",
};
const REFUSAL = "Target KPI disiapkan Direktur PT untuk perusahaannya.";

async function run(work: () => Promise<string>): Promise<Result> {
  try {
    const message = await work();
    revalidatePath("/kpi");
    revalidatePath("/pipeline");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}

const Form = z.object({ year: z.coerce.number().int().min(2000).max(2100), entityCode: z.string().min(1).max(20), revenue: z.string().max(40), revenueDirect: z.string().max(40), ebitdaPct: z.string().max(10), cashIn: z.string().max(40), netMarginPct: z.string().max(10) });

/** The company's Direktur writes the targets: a new version after an approved one, else the draft in hand. */
export async function saveKpi(form: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = Form.safeParse(Object.fromEntries(Object.keys(Form.shape).map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) return { ok: false, message: "Periksa isian." };
  const v = parsed.data;
  if (!canEditKpi(user.actor, v.entityCode)) return { ok: false, message: REFUSAL };
  let t;
  try {
    const percent = (s: string) => money(s.trim().replace(",", ".") || "0");
    t = { revenue: parseIdr(v.revenue || "0"), revenueDirect: parseIdr(v.revenueDirect || "0"), ebitdaPct: percent(v.ebitdaPct), cashIn: parseIdr(v.cashIn || "0"), netMarginPct: percent(v.netMarginPct) };
  } catch {
    return { ok: false, message: "Angka tidak terbaca." };
  }
  const problem = kpiProblem(t);
  if (problem) return { ok: false, message: PROBLEM[problem] };
  const file = form.get("document");
  const hasDocument = file instanceof File && file.size > 0;
  if (hasDocument) {
    const bad = documentProblem(file);
    if (bad) return { ok: false, message: bad };
  }
  return run(() =>
    db.transaction(async (tx) => {
      const [latest] = await tx
        .select()
        .from(schema.kpiTarget)
        .where(and(eq(schema.kpiTarget.fiscalYear, v.year), eq(schema.kpiTarget.entityCode, v.entityCode)))
        .orderBy(desc(schema.kpiTarget.version))
        .limit(1)
        .for("update");
      if (latest?.state === "submitted") throw new WorkflowError("Target ini sedang menunggu BOD.");
      let document = {};
      if (hasDocument) {
        const upload = file as File;
        const path = `kpi/${v.year}/${randomUUID()}-${upload.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "dokumen"}`;
        await putFile(path, new Uint8Array(await upload.arrayBuffer()), upload.type);
        document = { documentName: upload.name.slice(0, 200), documentPath: path, documentType: upload.type };
      }
      const figures = {
        revenue: t.revenue.toFixed(2), revenueDirect: t.revenueDirect.toFixed(2), ebitdaPct: t.ebitdaPct.toFixed(2), cashIn: t.cashIn.toFixed(2),
        netMarginPct: t.netMarginPct.toFixed(2), updatedAt: new Date(),
      };
      const fresh = !latest || latest.state === "approved";
      let id = latest?.id;
      if (fresh) {
        const [row] = await tx.insert(schema.kpiTarget).values({ fiscalYear: v.year, entityCode: v.entityCode, version: (latest?.version ?? 0) + 1, ...figures, ...document }).returning({ id: schema.kpiTarget.id });
        id = row!.id;
      } else await tx.update(schema.kpiTarget).set({ ...figures, ...document, state: "draft" }).where(eq(schema.kpiTarget.id, latest.id));
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "kpi.save", subjectType: "kpi_target", subjectId: id!, before: latest ?? null, after: { ...figures, ...document } });
      return latest?.state === "approved" ? "Versi baru disimpan; target aktif tetap berlaku sampai BOD menyetujui yang baru." : "Draft target disimpan.";
    }),
  );
}

export async function runKpiAction(id: string, action: KpiAction, note: string): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ id: z.string().uuid(), action: z.enum(KPI_ACTIONS), note: z.string().trim().max(500) }).safeParse({ id, action, note });
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const v = parsed.data;
  let sent: { year: number; entity: string; to: string; by: string | null } | null = null;
  const result = await run(() =>
    db.transaction(async (tx) => {
      const [row] = await tx.select().from(schema.kpiTarget).where(eq(schema.kpiTarget.id, v.id)).for("update");
      if (!row) throw new WorkflowError("Target tidak ditemukan.");
      const step = kpiStep({ state: row.state, entity: row.entityCode, submittedBy: row.submittedBy, hasDocument: !!row.documentPath }, v.action, user.actor, v.note);
      if ("problem" in step) {
        throw new WorkflowError(step.problem === "note_required" ? "Tulis alasan pengembalian." : step.problem === "document_required" ? "Lampirkan keputusan direksi (BOD) sebelum disetujui." : "Anda tidak berwenang atas langkah ini.");
      }
      if (v.action === "submit" && kpiProblem(targetsOf(row))) throw new WorkflowError(PROBLEM[kpiProblem(targetsOf(row))!]);
      const patch = {
        state: step.to,
        updatedAt: new Date(),
        ...(v.action === "submit" ? { submittedBy: user.id, note: null } : {}),
        ...(v.action === "approve" ? { approvedBy: user.id, approvedAt: new Date() } : {}),
        ...(v.action === "return" ? { note: v.note } : {}),
      };
      await tx.update(schema.kpiTarget).set(patch).where(eq(schema.kpiTarget.id, row.id));
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: `kpi.${v.action}`, subjectType: "kpi_target", subjectId: row.id, before: { state: row.state }, after: { state: step.to, ...(v.note ? { note: v.note } : {}) } });
      sent = { year: row.fiscalYear, entity: row.entityCode, to: step.to, by: row.submittedBy };
      return "Disimpan.";
    }),
  );
  const s = sent as { year: number; entity: string; to: string; by: string | null } | null;
  if (result.ok && s) {
    const seats = await loadSeats();
    // The BOD hears of a submission; the submitter hears the decision.
    const ids = s.to === "submitted" ? seats.flatMap((x) => (x.role === "director" && x.entities.includes("*") && x.occupant && x.occupant !== user.id ? [x.occupant] : [])) : s.by ? [s.by] : [];
    for (const userId of new Set(ids)) {
      const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
      if (!u?.active) continue;
      const template = s.to === "submitted" ? ("kpi_submitted" as const) : ("kpi_decided" as const);
      await enqueueEmail({ template, to: { userId: u.id, email: u.email, name: u.name }, payload: { url: `${env.APP_URL}/kpi`, year: String(s.year), entity: s.entity, result: s.to === "approved" ? "disetujui" : "dikembalikan", ...(s.to === "returned" ? { comment: v.note } : {}) } });
      await db.insert(schema.notification).values({ userId: u.id, template, link: "/kpi" });
    }
  }
  return result;
}
