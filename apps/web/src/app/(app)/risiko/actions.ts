"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import {
  RISK_CATEGORIES, RISK_STATUSES, RISK_STATUS_LABEL, canDecideRisk, canEditRisk, canWorkRisk, documentProblem, nextReview, riskProblem, riskScore, statusProblem, type RiskStatus,
} from "@estrada/domain";
import { todayJakarta } from "@/lib/payment";
import { insertRisk } from "@/lib/risk";
import { requireUser } from "@/lib/session";
import { putFile } from "@/lib/storage";
import { WorkflowError, loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string; id?: string };

async function run(work: () => Promise<{ message: string; id?: string }>): Promise<Result> {
  try {
    const done = await work();
    revalidatePath("/risiko", "layout");
    return { ok: true, ...done };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}

const read = (form: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, String(form.get(k) ?? "")]));
const PROBLEM = { title: "Tulis judul risiko.", scale: "Likelihood dan impact 1 sampai 5.", owner: "Pilih pemilik risiko.", plan: "Risiko High dan Critical wajib punya rencana aksi dan tenggat." };
const REFUSAL = "Register risiko diisi Finance, Head FRM atau Direktur untuk perusahaannya.";

const Form = z.object({
  id: z.union([z.literal(""), z.string().uuid()]),
  entityCode: z.string().max(20),
  category: z.enum(RISK_CATEGORIES),
  title: z.string().trim().max(200),
  description: z.string().trim().max(2000),
  likelihood: z.coerce.number(),
  impact: z.coerce.number(),
  ownerUserId: z.string().max(100),
  actionPlan: z.string().trim().max(2000),
  dueOn: z.union([z.literal(""), z.string().date()]),
});

export async function saveRisk(form: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = Form.safeParse(read(form, Object.keys(Form.shape)));
  if (!parsed.success) return { ok: false, message: "Periksa isian." };
  const { id, dueOn, entityCode, ...rest } = parsed.data;
  const v = { ...rest, entityCode: entityCode || null, dueOn: dueOn || null };
  const org = await loadOrg();
  if (!canEditRisk(user.actor, { entity: v.entityCode }, org)) return { ok: false, message: REFUSAL };
  const problem = riskProblem(v);
  if (problem) return { ok: false, message: PROBLEM[problem] };
  return run(() =>
    db.transaction(async (tx) => {
      let saved = id;
      if (!id) saved = (await insertRisk(tx, { ...v, createdBy: user.id }, todayJakarta(), user.id)).id;
      else {
        const [row] = await tx.select().from(schema.risk).where(eq(schema.risk.id, id)).for("update");
        if (!row || !canEditRisk(user.actor, { entity: row.entityCode }, org)) throw new WorkflowError(REFUSAL);
        if (row.status === "closed" || row.status === "accepted") throw new WorkflowError("Risiko ini sudah ditutup.");
        await tx.update(schema.risk).set({ ...v, updatedAt: new Date() }).where(eq(schema.risk.id, id));
        const [prior, next] = [riskScore(row.likelihood, row.impact), riskScore(v.likelihood, v.impact)];
        if (prior !== next) await tx.insert(schema.riskLog).values({ riskId: id, kind: "review", note: "Skor diubah lewat isian.", priorScore: prior, newScore: next, userId: user.id });
      }
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "risk.save", subjectType: "risk", subjectId: saved, after: v });
      return { message: "Risiko disimpan.", id: saved };
    }),
  );
}

const Entry = z.object({ id: z.string().uuid(), kind: z.enum(["action", "review", "status"]), note: z.string().trim().max(2000), status: z.string().max(20), likelihood: z.coerce.number(), impact: z.coerce.number() });

/** An action taken, a review with a new score, or a change of status; evidence may come with any of them. */
export async function logRisk(form: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = Entry.safeParse(read(form, Object.keys(Entry.shape)));
  if (!parsed.success) return { ok: false, message: "Periksa isian." };
  const v = parsed.data;
  const org = await loadOrg();
  const file = form.get("document");
  const upload = file instanceof File && file.size > 0 ? file : null;
  if (upload) {
    const bad = documentProblem(upload);
    if (bad) return { ok: false, message: bad };
  }
  return run(() =>
    db.transaction(async (tx) => {
      const [row] = await tx.select().from(schema.risk).where(eq(schema.risk.id, v.id)).for("update");
      const subject = row && { entity: row.entityCode, ownerUserId: row.ownerUserId, likelihood: row.likelihood, impact: row.impact };
      if (!row || !subject || !canWorkRisk(user.actor, subject, org)) throw new WorkflowError("Risiko ini dikerjakan pemiliknya, Finance, Head FRM atau Direktur.");
      if (row.status === "closed" || row.status === "accepted") throw new WorkflowError("Risiko ini sudah ditutup.");
      const today = todayJakarta();
      const patch: Partial<typeof schema.risk.$inferInsert> = { updatedAt: new Date() };
      const entry: Partial<typeof schema.riskLog.$inferInsert> = {};
      let note = v.note;
      if (v.kind === "action") {
        if (!note) throw new WorkflowError("Tulis tindakan yang dilakukan.");
        if (row.status === "identified") patch.status = "in_progress";
      } else if (v.kind === "review") {
        const next = { ...row, likelihood: v.likelihood, impact: v.impact };
        const problem = riskProblem(next);
        if (problem) throw new WorkflowError(PROBLEM[problem]);
        Object.assign(patch, { likelihood: v.likelihood, impact: v.impact, nextReviewOn: nextReview(today) });
        Object.assign(entry, { priorScore: riskScore(row.likelihood, row.impact), newScore: riskScore(v.likelihood, v.impact) });
      } else {
        const to = RISK_STATUSES.find((s) => s === v.status);
        if (!to) throw new WorkflowError("Status tidak dikenal.");
        if ((to === "closed" || to === "accepted") && !canDecideRisk(user.actor, subject, to, org)) throw new WorkflowError("Menutup atau menerima risiko diputuskan Head FRM atau Direktur yang bukan pemiliknya; menerima risiko Critical hanya BOD.");
        const evidence = upload !== null || (await tx.select({ path: schema.riskLog.documentPath }).from(schema.riskLog).where(eq(schema.riskLog.riskId, row.id))).some((l) => l.path);
        const problem = statusProblem(row.status as RiskStatus, to, { note, evidence });
        if (problem) throw new WorkflowError(problem === "evidence" ? "Lampirkan bukti sebelum menutup risiko." : problem === "note" ? "Tulis alasan keputusan." : "Status tidak berubah.");
        patch.status = to;
        if (to === "closed" || to === "accepted") Object.assign(patch, { decidedBy: user.id, decidedOn: today });
        note = [`Status: ${RISK_STATUS_LABEL[to]}.`, note].filter(Boolean).join(" ");
      }
      if (upload) {
        const path = `risk/${row.id}/${randomUUID()}-${upload.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "bukti"}`;
        await putFile(path, new Uint8Array(await upload.arrayBuffer()), upload.type);
        Object.assign(entry, { documentName: upload.name.slice(0, 200), documentPath: path, documentType: upload.type });
      }
      await tx.update(schema.risk).set(patch).where(eq(schema.risk.id, row.id));
      await tx.insert(schema.riskLog).values({ riskId: row.id, kind: v.kind, note, userId: user.id, ...entry });
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: `risk.${v.kind}`, subjectType: "risk", subjectId: row.id, before: { status: row.status, likelihood: row.likelihood, impact: row.impact }, after: { ...patch, note } });
      return { message: "Dicatat." };
    }),
  );
}
