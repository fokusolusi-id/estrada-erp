"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { ARTEFACTS, EOS_CHECKLIST, MSO_CRITERIA, canHandover, handoverProblems, serviceStage, type HandoverAction, type HandoverProblem, type HandoverState } from "@estrada/domain";
import { loadHandover, loadProjects } from "@/lib/implementasi";
import { notifyProject } from "@/lib/project-notify";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const WHO: Record<HandoverAction, string> = {
  artefact: "Paket serah terima diisi oleh tim proyek (Project Manager, Delivery Control, Project Admin).",
  submit: "Paket serah terima diajukan oleh Project Manager proyek ini.",
  accept_mso: "Kelayakan serah terima disahkan oleh Head MSO.",
  return: "Paket dikembalikan oleh Head MSO.",
  checklist: "Checklist operasional diisi oleh Staff Operational EOS.",
  accept_iso: "Turunan teknis diterima oleh Head ISO.",
};
const MESSAGE: Record<HandoverProblem, string> = {
  wrong_status: "Status paket serah terima tidak sesuai untuk langkah ini.",
  bast: "BAST belum disahkan.",
  artefacts: "Artefak wajib belum lengkap.",
  criteria: "Kelima kriteria harus terpenuhi sebelum menerima. Bila ada yang kurang, kembalikan paket dengan catatan.",
  checklist: "Empat checklist operasional EOS belum terpenuhi.",
  note: "Tulis catatan kekurangan.",
  HANDOVER_SELF_ACCEPTANCE: "Penyerah paket serah terima tidak boleh menyatakan menerima.",
};

/** Loads the project and its package, and checks the actor and the gate. Returns the failure, or what the action needs. */
async function gate(projectId: string, action: HandoverAction, patch: Partial<HandoverState> = {}, note = "") {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(projectId).success) return { fail: { ok: false, message: "Permintaan tidak valid." } };
  const [org, [project], handover] = await Promise.all([loadOrg(), loadProjects(projectId), loadHandover(projectId)]);
  if (!project || !canHandover(user.actor, action, project, org)) return { fail: { ok: false, message: WHO[action] } };
  const state: HandoverState = { ...handover, artefacts: Object.keys(handover.artefacts).map(Number), bastOn: project.bast.on, ...patch };
  const { problems, next } = handoverProblems(action, state, user.id, note);
  if (problems[0]) return { fail: { ok: false, message: MESSAGE[problems[0]] } };
  return { user, project, handover, next };
}

const done = (projectId: string) => {
  revalidatePath("/implementasi");
  revalidatePath(`/implementasi/${projectId}`);
  revalidatePath(`/implementasi/${projectId}/serah-terima`);
};

const keys = <T extends readonly { key: string }[]>(list: T, input: Record<string, boolean>) => Object.fromEntries(list.map((c) => [c.key, input[c.key] === true]));

const Package = z.object({ hasApplication: z.boolean(), references: z.record(z.string(), z.string().max(500)) });

/** Saves where each artefact is kept. The project team, while PMO still holds the package. */
export async function savePackage(projectId: string, input: z.input<typeof Package>): Promise<Result> {
  const parsed = Package.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Data paket tidak valid." };
  const g = await gate(projectId, "artefact");
  if (g.fail) return g.fail;
  const rows = ARTEFACTS.map((a) => ({ no: a.no, reference: (parsed.data.references[a.no] ?? "").trim() })).filter((r) => r.reference);
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.projectHandover)
      .values({ projectId, hasApplication: parsed.data.hasApplication })
      .onConflictDoUpdate({ target: schema.projectHandover.projectId, set: { hasApplication: parsed.data.hasApplication, updatedAt: new Date() } });
    await tx.delete(schema.handoverArtefact).where(eq(schema.handoverArtefact.projectId, projectId));
    if (rows.length) await tx.insert(schema.handoverArtefact).values(rows.map((r) => ({ ...r, projectId, updatedBy: g.user.id })));
    await tx.insert(schema.auditLog).values({
      actorUserId: g.user.id,
      action: "handover.package",
      subjectType: "project_handover",
      subjectId: projectId,
      before: { hasApplication: g.handover.hasApplication, artefacts: g.handover.artefacts },
      after: { hasApplication: parsed.data.hasApplication, artefacts: Object.fromEntries(rows.map((r) => [r.no, r.reference])) },
    });
  });
  done(projectId);
  return { ok: true, message: "Paket serah terima disimpan." };
}

/** The Project Manager submits the package to MSO: after BAST, with every mandatory artefact in. */
export async function submitHandover(projectId: string): Promise<Result> {
  const g = await gate(projectId, "submit");
  if (g.fail) return g.fail;
  const values = { status: g.next, submittedBy: g.user.id, submittedAt: new Date(), criteria: {}, returnNote: null, updatedAt: new Date() };
  await db.transaction(async (tx) => {
    await tx.insert(schema.projectHandover).values({ projectId, ...values }).onConflictDoUpdate({ target: schema.projectHandover.projectId, set: values });
    await tx.insert(schema.auditLog).values({ actorUserId: g.user.id, action: "handover.submit", subjectType: "project_handover", subjectId: projectId, before: { status: g.handover.status }, after: { status: g.next } });
  });
  done(projectId);
  await notifyProject("handover_submitted", g.project, g.user.id);
  return { ok: true, message: "Paket serah terima diajukan ke MSO." };
}

const Decision = z.object({ accept: z.boolean(), criteria: z.record(z.string(), z.boolean()), note: z.string().max(2000).optional() });

/**
 * Head MSO accepts the handover against the five criteria, or returns it to PMO with what is missing. Acceptance
 * dates the move of responsibility for the service and takes the project into Layanan.
 */
export async function decideHandover(projectId: string, input: z.input<typeof Decision>): Promise<Result> {
  const parsed = Decision.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const criteria = keys(MSO_CRITERIA, parsed.data.criteria);
  const note = parsed.data.note?.trim() ?? "";
  const g = await gate(projectId, parsed.data.accept ? "accept_mso" : "return", { criteria }, note);
  if (g.fail) return g.fail;
  const today = todayJakarta();
  await db.transaction(async (tx) => {
    const set = parsed.data.accept ? { status: g.next, criteria, msoAcceptedBy: g.user.id, returnNote: null, updatedAt: new Date() } : { status: g.next, criteria, returnNote: note, updatedAt: new Date() };
    await tx.update(schema.projectHandover).set(set).where(eq(schema.projectHandover.projectId, projectId));
    if (parsed.data.accept) await tx.update(schema.project).set({ msoAcceptedOn: today, status: "Layanan", updatedAt: new Date() }).where(eq(schema.project.id, projectId));
    await tx.insert(schema.auditLog).values({
      actorUserId: g.user.id,
      action: parsed.data.accept ? "handover.accept_mso" : "handover.return",
      subjectType: "project_handover",
      subjectId: projectId,
      before: { status: g.handover.status, projectStatus: g.project.status },
      after: parsed.data.accept ? { status: g.next, criteria, msoAcceptedOn: today, projectStatus: "Layanan" } : { status: g.next, criteria, returnNote: note },
    });
  });
  done(projectId);
  await notifyProject(parsed.data.accept ? "handover_accepted" : "handover_returned", g.project, g.user.id, parsed.data.accept ? {} : { comment: note });
  return { ok: true, message: parsed.data.accept ? "Serah terima diterima MSO; proyek masuk tahap Layanan." : "Paket dikembalikan ke PMO." };
}

/** Staff Operational EOS records the four operational checks. */
export async function saveChecklist(projectId: string, input: Record<string, boolean>): Promise<Result> {
  const parsed = z.record(z.string(), z.boolean()).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const checklist = keys(EOS_CHECKLIST, parsed.data);
  const g = await gate(projectId, "checklist");
  if (g.fail) return g.fail;
  await db.transaction(async (tx) => {
    await tx.update(schema.projectHandover).set({ checklist, checklistBy: g.user.id, updatedAt: new Date() }).where(eq(schema.projectHandover.projectId, projectId));
    await tx.insert(schema.auditLog).values({ actorUserId: g.user.id, action: "handover.checklist", subjectType: "project_handover", subjectId: projectId, before: g.handover.checklist, after: checklist });
  });
  done(projectId);
  return { ok: true, message: "Checklist operasional disimpan." };
}

/** Head ISO accepts what follows from the handover: the service enters ISO's monitoring. */
export async function acceptIso(projectId: string): Promise<Result> {
  const g = await gate(projectId, "accept_iso");
  if (g.fail) return g.fail;
  const stage = serviceStage({ status: g.project.status, handoverStatus: g.next, warrantyEndsOn: g.project.warrantyEndsOn });
  await db.transaction(async (tx) => {
    await tx
      .update(schema.projectHandover)
      .set({ status: g.next, isoAcceptedBy: g.user.id, isoAcceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.projectHandover.projectId, projectId));
    // With the warranty end date already set, ISO's acceptance takes the project into Garansi.
    if (stage !== g.project.status) await tx.update(schema.project).set({ status: stage, updatedAt: new Date() }).where(eq(schema.project.id, projectId));
    await tx.insert(schema.auditLog).values({
      actorUserId: g.user.id,
      action: "handover.accept_iso",
      subjectType: "project_handover",
      subjectId: projectId,
      before: { status: g.handover.status, projectStatus: g.project.status },
      after: { status: g.next, projectStatus: stage },
    });
  });
  done(projectId);
  revalidatePath(`/implementasi/${projectId}/garansi`);
  return { ok: true, message: stage === "Garansi" ? "Turunan teknis diterima ISO; proyek masuk tahap Garansi." : "Turunan teknis diterima ISO." };
}
