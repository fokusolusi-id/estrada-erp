"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import {
  FROM_CLOSING, PERIOD_TYPES, REPORT_KINDS, REPORT_KIND_LABEL, canPrepareReport, isCfo, periodLabel, reportMonths, reportProblem, reportStep, type PeriodType, type ReportAction, type ReportKind,
} from "@estrada/domain";
import { env } from "@/lib/env";
import { enqueueEmail } from "@/lib/email/outbox";
import { loadSeats, todayJakarta } from "@/lib/payment";
import { buildReport, closedMonths } from "@/lib/report";
import { requireUser } from "@/lib/session";
import { WorkflowError, loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string; id?: string };

async function run(work: () => Promise<{ message: string; id?: string }>): Promise<Result> {
  try {
    const done = await work();
    revalidatePath("/laporan");
    return { ok: true, ...done };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}

const Form = z.object({ kind: z.enum(REPORT_KINDS), periodType: z.enum(PERIOD_TYPES), periodNo: z.coerce.number().int(), year: z.coerce.number().int().min(2000).max(2100), company: z.string().min(1).max(20) });

/** A draft with today's figures: the draft in hand is refreshed, an approved report gets a new version. */
export async function generateReport(form: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = Form.safeParse(Object.fromEntries(Object.keys(Form.shape).map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) return { ok: false, message: "Periksa isian." };
  const v = parsed.data;
  const months = reportMonths(v.periodType, v.periodNo);
  if (!months.length) return { ok: false, message: "Periode tidak ada." };
  const all = await db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code));
  const entities = v.company === "KONSOLIDASI" ? all.map((c) => c.code) : all.map((c) => c.code).filter((c) => c === v.company);
  if (!canPrepareReport(user.actor, entities.length ? entities : [v.company])) return { ok: false, message: "Laporan disiapkan Finance untuk perusahaan dalam cakupannya." };
  if (!entities.length) return { ok: false, message: "Perusahaan tidak dikenal." };
  const scope = entities.join("+");
  const content = await buildReport(v.kind, entities, v.year, months, todayJakarta());
  return run(() =>
    db.transaction(async (tx) => {
      const key = { kind: v.kind, periodType: v.periodType, periodNo: v.periodNo, year: v.year, scope };
      const [latest] = await tx
        .select()
        .from(schema.periodicReport)
        .where(and(eq(schema.periodicReport.kind, v.kind), eq(schema.periodicReport.year, v.year), eq(schema.periodicReport.periodType, v.periodType), eq(schema.periodicReport.periodNo, v.periodNo), eq(schema.periodicReport.scope, scope)))
        .orderBy(desc(schema.periodicReport.version))
        .limit(1)
        .for("update");
      if (latest && (latest.state === "submitted" || latest.state === "reviewed")) throw new WorkflowError("Laporan ini sedang direview.");
      const values = { content, generatedAt: new Date(), preparedBy: user.id };
      let id: string;
      if (latest?.state === "draft") {
        await tx.update(schema.periodicReport).set(values).where(eq(schema.periodicReport.id, latest.id));
        id = latest.id;
      } else {
        const [row] = await tx.insert(schema.periodicReport).values({ ...key, ...values, version: (latest?.version ?? 0) + 1 }).returning({ id: schema.periodicReport.id });
        id = row!.id;
      }
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "report.generate", subjectType: "periodic_report", subjectId: id, after: key });
      return { message: "Draft laporan dibuat.", id };
    }),
  );
}

const PROBLEM = { forbidden: "Anda tidak berwenang atas langkah ini.", note: "Tulis alasan pengembalian." };

export async function runReportAction(id: string, action: ReportAction, note: string): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ id: z.string().uuid(), action: z.enum(["submit", "review", "approve", "return", "distribute"]), note: z.string().trim().max(500) }).safeParse({ id, action, note });
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const v = parsed.data;
  const org = await loadOrg();
  let sent: { row: typeof schema.periodicReport.$inferSelect; to: string } | null = null;
  const result = await run(() =>
    db.transaction(async (tx) => {
      const [row] = await tx.select().from(schema.periodicReport).where(eq(schema.periodicReport.id, v.id)).for("update");
      if (!row) throw new WorkflowError("Laporan tidak ditemukan.");
      const kind = row.kind as ReportKind;
      const entities = row.scope.split("+");
      const months = reportMonths(row.periodType as PeriodType, row.periodNo);
      const step = reportStep(user.actor, { kind, state: row.state as never, entities, preparedBy: row.preparedBy, reviewedBy: row.reviewedBy }, v.action, v.note, org);
      if (!step.ok) throw new WorkflowError(PROBLEM[step.problem]);
      if (v.action === "submit" || v.action === "approve") {
        const open = reportProblem(kind, entities, months, await closedMonths(entities, row.year));
        if (open.length) throw new WorkflowError(`Tutup buku dulu: ${open.slice(0, 6).map((o) => o.replace(":", " bulan ")).join(", ")}${open.length > 6 ? ", …" : ""}.`);
      }
      const patch = {
        state: step.to,
        // The books are closed now: what goes to review is the closed figures.
        ...(v.action === "submit" ? { note: null, ...(FROM_CLOSING.includes(kind) ? { content: await buildReport(kind, entities, row.year, months, todayJakarta()), generatedAt: new Date() } : {}) } : {}),
        ...(v.action === "review" ? { reviewedBy: user.id, reviewedAt: new Date() } : {}),
        ...(v.action === "approve" ? { approvedBy: user.id, approvedAt: new Date() } : {}),
        ...(v.action === "return" ? { note: v.note, reviewedBy: null, reviewedAt: null } : {}),
        ...(v.action === "distribute" ? { distributedAt: new Date() } : {}),
      };
      await tx.update(schema.periodicReport).set(patch).where(eq(schema.periodicReport.id, row.id));
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: `report.${v.action}`, subjectType: "periodic_report", subjectId: row.id, before: { state: row.state }, after: { state: step.to, ...(v.note ? { note: v.note } : {}) } });
      sent = { row, to: step.to };
      return { message: "Disimpan." };
    }),
  );
  const s = sent as { row: typeof schema.periodicReport.$inferSelect; to: string } | null;
  if (result.ok && s) await tell(s.row, s.to, user.id, v.note, org);
  return result;
}

/** One email to whoever holds the report next. */
async function tell(r: typeof schema.periodicReport.$inferSelect, to: string, actorId: string, note: string, org: Awaited<ReturnType<typeof loadOrg>>) {
  if (to === "approved") return;
  const entities = r.scope.split("+");
  const seats = (await loadSeats()).filter((s) => s.occupant && s.occupant !== actorId);
  const covering = seats.filter((s) => s.entities.includes("*") || entities.every((e) => s.entities.includes(e)));
  const ids =
    to === "draft"
      ? [r.preparedBy]
      : to === "submitted"
        ? covering.filter((s) => s.role === "finance" && s.occupant !== r.preparedBy).map((s) => s.occupant!)
        : to === "reviewed"
          ? covering.filter((s) => isCfo({ userId: s.occupant!, role: s.role, orgUnit: s.orgUnit, entities: s.entities }, org)).map((s) => s.occupant!)
          : covering.filter((s) => s.role === "director" || s.role === "auditor").map((s) => s.occupant!);
  const link = `/laporan/${r.id}`;
  const report = `${REPORT_KIND_LABEL[r.kind as ReportKind]} ${periodLabel(r.periodType as PeriodType, r.periodNo, r.year)}`;
  const template = to === "draft" ? ("report_returned" as const) : to === "distributed" ? ("report_distributed" as const) : ("report_step" as const);
  for (const userId of new Set(ids)) {
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
    if (!u?.active) continue;
    const action = to === "submitted" ? "menunggu review Anda" : "menunggu persetujuan Anda";
    await enqueueEmail({ template, to: { userId: u.id, email: u.email, name: u.name }, payload: { url: `${env.APP_URL}${link}`, report, action, ...(to === "draft" ? { comment: note } : {}) } });
    await db.insert(schema.notification).values({ userId: u.id, template, link });
  }
}
