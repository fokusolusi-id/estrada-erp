"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { PLANNING_ITEMS, baselineProblems, canPlanning, kickoffGateProblems, type BaselineProblem, type PlanningAction, type PlanningKey } from "@estrada/domain";
import { loadPlanning, loadProjects } from "@/lib/implementasi";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const done = (projectId: string) => {
  revalidatePath("/implementasi");
  revalidatePath(`/implementasi/${projectId}`);
  revalidatePath(`/implementasi/${projectId}/perencanaan`);
};

const WHO = {
  record: "Catatan perencanaan diisi oleh Project Manager (kick-off, charter, risk register) atau Project Admin (MoM, berkas kebutuhan) proyek ini.",
  approve_gate: "Kick-Off Gate disahkan oleh Head PMO yang bukan anggota tim proyek ini.",
  approve_baseline: "Baseline disahkan oleh Head PMO yang bukan anggota tim proyek ini.",
};

async function load(projectId: string, action: PlanningAction, key: PlanningKey | null) {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(projectId).success) return { fail: { ok: false, message: "Permintaan tidak valid." } };
  const [org, [project], planning] = await Promise.all([loadOrg(), loadProjects(projectId), loadPlanning(projectId)]);
  if (!project || !canPlanning(user.actor, action, key, project, org)) return { fail: { ok: false, message: WHO[action] } };
  return { user, project, planning };
}

/** Records where one planning document is kept. */
export async function savePlanningItem(projectId: string, key: string, reference: string): Promise<Result> {
  const parsed = z.object({ key: z.enum(PLANNING_ITEMS.map((i) => i.key) as [PlanningKey, ...PlanningKey[]]), reference: z.string().trim().min(1).max(500) }).safeParse({ key, reference });
  if (!parsed.success) return { ok: false, message: "Isi rujukan dokumen (tempat berkasnya disimpan)." };
  const l = await load(projectId, "record", parsed.data.key);
  if (l.fail) return l.fail;
  await db.transaction(async (tx) => {
    const values = { reference: parsed.data.reference, recordedBy: l.user.id, recordedAt: new Date() };
    await tx
      .insert(schema.projectPlanningItem)
      .values({ projectId, key: parsed.data.key, ...values })
      .onConflictDoUpdate({ target: [schema.projectPlanningItem.projectId, schema.projectPlanningItem.key], set: values });
    await tx.insert(schema.auditLog).values({
      actorUserId: l.user.id,
      action: "project_planning.record",
      subjectType: "project",
      subjectId: projectId,
      before: l.planning[parsed.data.key] ?? null,
      after: { key: parsed.data.key, reference: parsed.data.reference },
    });
  });
  done(projectId);
  return { ok: true, message: "Catatan disimpan." };
}

const MISSING = { kickoff: "Notulen kick-off belum dicatat.", mom: "MoM kick-off belum dicatat." };

/** The Head PMO validates the incoming project: the Kick-Off Gate. */
export async function approveKickoffGate(projectId: string): Promise<Result> {
  const l = await load(projectId, "approve_gate", null);
  if (l.fail) return l.fail;
  if (l.project.kickoffGateOn) return { ok: false, message: "Kick-Off Gate sudah disahkan." };
  const problem = kickoffGateProblems({ filled: Object.keys(l.planning) })[0];
  if (problem) return { ok: false, message: MISSING[problem] };
  const today = todayJakarta();
  await db.transaction(async (tx) => {
    await tx.update(schema.project).set({ kickoffGateOn: today, kickoffGateBy: l.user.id, updatedAt: new Date() }).where(eq(schema.project.id, projectId));
    await tx.insert(schema.auditLog).values({ actorUserId: l.user.id, action: "project.kickoff_gate", subjectType: "project", subjectId: projectId, after: { kickoffGateOn: today } });
  });
  done(projectId);
  return { ok: true, message: "Kick-Off Gate disahkan." };
}

const BASELINE_MESSAGE: Record<BaselineProblem, string> = {
  kickoff_gate: "Kick-Off Gate belum disahkan.",
  charter: "Project Charter belum dicatat.",
  risk: "Risk Register belum dicatat.",
  team: "Tim proyek (Project Manager, Delivery Control, Project Admin) belum lengkap.",
  rfs_target: "Isi tanggal target RFS yang valid.",
};

/** The Head PMO approves the baseline: the plan and its target RFS date. After it, a change is a change order. */
export async function approveBaseline(projectId: string, rfsTargetOn: string): Promise<Result> {
  const l = await load(projectId, "approve_baseline", null);
  if (l.fail) return l.fail;
  if (l.project.baselineOn) return { ok: false, message: "Baseline sudah disahkan." };
  const problem = baselineProblems({ kickoffGateOn: l.project.kickoffGateOn, filled: Object.keys(l.planning), team: l.project.team, rfsTargetOn: String(rfsTargetOn) })[0];
  if (problem) return { ok: false, message: BASELINE_MESSAGE[problem] };
  const today = todayJakarta();
  await db.transaction(async (tx) => {
    await tx.update(schema.project).set({ baselineOn: today, baselineBy: l.user.id, rfsTargetOn, updatedAt: new Date() }).where(eq(schema.project.id, projectId));
    await tx.insert(schema.auditLog).values({ actorUserId: l.user.id, action: "project.baseline", subjectType: "project", subjectId: projectId, after: { baselineOn: today, rfsTargetOn } });
  });
  done(projectId);
  return { ok: true, message: "Baseline disahkan; pekerjaan lapangan dapat dimulai." };
}
