"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { ASSURANCE_AREAS, TELKOM_STAGES, canCompleteStage, canViewTracker, documentProblem, stagePosition, stageProblem, type StageProblem } from "@estrada/domain";
import { todayJakarta } from "@/lib/payment";
import { requireUser, type CurrentUser } from "@/lib/session";
import { putFile } from "@/lib/storage";
import { loadOrg, WorkflowError } from "@/lib/workflow";

type Result = { ok: boolean; message: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const MESSAGE: Record<StageProblem, string> = {
  order: "Tahap harus berurutan.",
  required: "Tahap ini wajib: tidak bisa ditandai tidak berlaku.",
  reason: "Tulis alasan tidak berlaku.",
  date: "Tanggal harus sesudah tahap sebelumnya dan tidak setelah hari ini.",
  document: "Lampirkan dokumen bukti tahap ini.",
};
const Id = z.string().uuid("Proyek tidak ditemukan.");
const day = /^\d{4}-\d{2}-\d{2}$/;

async function projectFor(id: string) {
  const [row] = await db
    .select({ id: schema.project.id, status: schema.project.status, telkom: schema.project.telkomScheme, entity: schema.pipelineDeal.entityCode })
    .from(schema.project)
    .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.project.dealId))
    .where(eq(schema.project.id, id));
  return row;
}
const covers = (user: CurrentUser, entity: string) => user.actor.entities.includes("*") || user.actor.entities.includes(entity);
const audit = (tx: Tx, userId: string, action: string, projectId: string, after: unknown) =>
  tx.insert(schema.auditLog).values({ actorUserId: userId, action: `telkom.${action}`, subjectType: "project", subjectId: projectId, after });
async function run(work: () => Promise<string>): Promise<Result> {
  try {
    const message = await work();
    revalidatePath("/tracker-telkom");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}

/** Sales starts following a TELKOM-scheme project; the first stage's SLA counts from this date. */
export async function startTracking(projectId: string, startedOn: string): Promise<Result> {
  const user = await requireUser();
  const org = await loadOrg();
  const project = Id.safeParse(projectId).success ? await projectFor(projectId) : undefined;
  if (!project || !canCompleteStage(user.actor, 1, project.entity, org)) return { ok: false, message: "Pelacakan dimulai Sales (BCD)." };
  if (!project.telkom) return { ok: false, message: "Proyek ini bukan skema TELKOM." };
  if (!day.test(startedOn) || startedOn > todayJakarta()) return { ok: false, message: "Isi tanggal mulai, tidak sesudah hari ini." };
  return run(() =>
    db.transaction(async (tx) => {
      const added = await tx.insert(schema.billingTrack).values({ projectId, startedOn, startedBy: user.id }).onConflictDoNothing().returning({ id: schema.billingTrack.projectId });
      if (!added.length) throw new WorkflowError("Proyek ini sudah dilacak.");
      await audit(tx, user.id, "start", projectId, { startedOn });
      return "Pelacakan dimulai.";
    }),
  );
}

/** The stage's own people record it done with its evidence, or not applicable with the reason. */
export async function completeStage(form: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = z
    .object({ projectId: Id, stage: z.coerce.number().int().min(1).max(12), doneOn: z.string().max(10), notApplicable: z.enum(["", "1"]), note: z.string().trim().max(500) })
    .safeParse(Object.fromEntries(["projectId", "stage", "doneOn", "notApplicable", "note"].map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) return { ok: false, message: "Periksa isian." };
  const v = parsed.data;
  const org = await loadOrg();
  const project = await projectFor(v.projectId);
  if (!project || !canCompleteStage(user.actor, v.stage, project.entity, org)) return { ok: false, message: `Tahap ini diisi ${TELKOM_STAGES[v.stage - 1]!.actor === "cash" ? "Cash Management" : "unit penanggung jawabnya"}.` };
  const file = form.get("document");
  const hasDocument = file instanceof File && file.size > 0;
  if (hasDocument) {
    const problem = documentProblem(file);
    if (problem) return { ok: false, message: problem };
  }
  return run(() =>
    db.transaction(async (tx) => {
      // The track is held, so a stage is completed once and in order.
      const [track] = await tx.select().from(schema.billingTrack).where(eq(schema.billingTrack.projectId, v.projectId)).for("update");
      if (!track) throw new WorkflowError("Proyek ini belum mulai dilacak.");
      const done = await tx.select().from(schema.billingStage).where(eq(schema.billingStage.projectId, v.projectId));
      const at = stagePosition(track.startedOn, done);
      const notApplicable = v.notApplicable === "1";
      const problem = stageProblem({ stage: v.stage, current: at.current, since: at.since, doneOn: v.doneOn, today: todayJakarta(), notApplicable, reason: v.note, hasDocument });
      if (problem) throw new WorkflowError(MESSAGE[problem]);
      let document = {};
      if (hasDocument && !notApplicable) {
        const upload = file as File;
        const path = `telkom/${v.projectId}/${randomUUID()}-${upload.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "dokumen"}`;
        await putFile(path, new Uint8Array(await upload.arrayBuffer()), upload.type);
        document = { documentName: upload.name.slice(0, 200), documentPath: path, documentType: upload.type };
      }
      const values = { projectId: v.projectId, stage: v.stage, doneOn: v.doneOn, notApplicable, note: v.note || null, doneBy: user.id, ...document };
      await tx.insert(schema.billingStage).values(values);
      await audit(tx, user.id, "stage", v.projectId, values);
      return "Tahap dicatat.";
    }),
  );
}

/** Takes back the last stage done, with the reason, by the people who own it. */
export async function reopenStage(projectId: string, reason: string): Promise<Result> {
  const user = await requireUser();
  const org = await loadOrg();
  const project = Id.safeParse(projectId).success ? await projectFor(projectId) : undefined;
  const [last] = project ? await db.select().from(schema.billingStage).where(eq(schema.billingStage.projectId, projectId)).orderBy(desc(schema.billingStage.stage)).limit(1) : [];
  if (!project || !last || !canCompleteStage(user.actor, last.stage, project.entity, org)) return { ok: false, message: "Hanya unit pemilik tahap terakhir yang dapat membatalkannya." };
  if (reason.trim().length < 5) return { ok: false, message: "Tulis alasan pembatalan." };
  return run(() =>
    db.transaction(async (tx) => {
      await tx.delete(schema.billingStage).where(and(eq(schema.billingStage.projectId, projectId), eq(schema.billingStage.stage, last.stage)));
      await audit(tx, user.id, "reopen", projectId, { stage: last, reason: reason.trim() });
      return "Tahap terakhir dibatalkan.";
    }),
  );
}

/** Delivery's people, or whoever may complete the stage, keep the obstacle log (BR-PNG-006). */
async function keeper(projectId: string, stage: number) {
  const user = await requireUser();
  const org = await loadOrg();
  const project = Id.safeParse(projectId).success ? await projectFor(projectId) : undefined;
  const may = !!project && canViewTracker(user.actor, org) && covers(user, project.entity) && (canCompleteStage(user.actor, stage, project.entity, org) || canCompleteStage(user.actor, 4, project.entity, org));
  return may ? user : null;
}

const Obstacle = z.object({ projectId: Id, stage: z.number().int().min(1).max(12), issue: z.string().trim().min(5, "Tulis kendalanya.").max(500), cause: z.string().trim().min(3, "Tulis penyebabnya.").max(500) });

export async function addObstacle(input: z.input<typeof Obstacle>): Promise<Result> {
  const parsed = Obstacle.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  const user = await keeper(v.projectId, v.stage);
  if (!user) return { ok: false, message: "Kendala dicatat tim delivery atau pemilik tahapnya." };
  return run(() =>
    db.transaction(async (tx) => {
      await tx.insert(schema.billingObstacle).values({ ...v, createdBy: user.id });
      await audit(tx, user.id, "obstacle", v.projectId, v);
      return "Kendala dicatat.";
    }),
  );
}

export async function updateObstacle(id: string, update: string, resolved: boolean): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid(), update: z.string().trim().min(3).max(500), resolved: z.boolean() }).safeParse({ id, update, resolved });
  if (!parsed.success) return { ok: false, message: "Tulis perkembangan terakhir." };
  const v = parsed.data;
  const [found] = await db.select().from(schema.billingObstacle).where(eq(schema.billingObstacle.id, v.id));
  const user = found ? await keeper(found.projectId, found.stage) : null;
  if (!found || !user) return { ok: false, message: "Kendala dicatat tim delivery atau pemilik tahapnya." };
  return run(() =>
    db.transaction(async (tx) => {
      const patch = { lastUpdate: v.update, resolvedOn: v.resolved ? todayJakarta() : null, updatedAt: new Date() };
      await tx.update(schema.billingObstacle).set(patch).where(eq(schema.billingObstacle.id, v.id));
      await audit(tx, user.id, "obstacle_update", found.projectId, { id: v.id, ...patch });
      return v.resolved ? "Kendala selesai." : "Perkembangan disimpan.";
    }),
  );
}

/** Delivery (Risa and Elvan in BR-PNG-002) keeps each project's JPMB standing. */
export async function saveAssurance(projectId: string, area: (typeof ASSURANCE_AREAS)[number], standing: "none" | "progress" | "done"): Promise<Result> {
  const parsed = z.object({ projectId: Id, area: z.enum(ASSURANCE_AREAS), standing: z.enum(["none", "progress", "done"]) }).safeParse({ projectId, area, standing });
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const v = parsed.data;
  const user = await requireUser();
  const org = await loadOrg();
  const project = await projectFor(v.projectId);
  if (!project || !canCompleteStage(user.actor, 4, project.entity, org)) return { ok: false, message: "Status JPMB diisi tim delivery." };
  return run(() =>
    db.transaction(async (tx) => {
      const key = and(eq(schema.billingAssurance.projectId, v.projectId), eq(schema.billingAssurance.area, v.area));
      if (v.standing === "none") await tx.delete(schema.billingAssurance).where(key);
      else {
        const values = { projectId: v.projectId, area: v.area, done: v.standing === "done", updatedBy: user.id, updatedAt: new Date() };
        await tx.insert(schema.billingAssurance).values(values).onConflictDoUpdate({ target: [schema.billingAssurance.projectId, schema.billingAssurance.area], set: values });
      }
      await audit(tx, user.id, "assurance", v.projectId, v);
      return "Status JPMB disimpan.";
    }),
  );
}
