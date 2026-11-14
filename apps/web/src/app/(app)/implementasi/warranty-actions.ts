"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { canWarranty, closureProblems, defectProblems, serviceStage, warrantyProblems, type ClosureProblem, type DefectAction, type DefectProblem, type WarrantyAction, type WarrantyProblem } from "@estrada/domain";
import { loadDefects, loadHandover, loadProjects } from "@/lib/implementasi";
import { notifyProject } from "@/lib/project-notify";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const done = (projectId: string) => {
  revalidatePath("/implementasi");
  revalidatePath(`/implementasi/${projectId}`);
  revalidatePath(`/implementasi/${projectId}/garansi`);
};

const WHO: Record<WarrantyAction, string> = {
  "warranty.set": "Tanggal akhir garansi diisi oleh BCD untuk entitasnya.",
  "defect.report": "Dugaan cacat bawaan dilaporkan oleh ISO atau MSO.",
  "defect.confirm_iso": "Penetapan sisi ISO dilakukan oleh Head ISO.",
  "defect.confirm_pmo": "Penetapan sisi PMO dilakukan oleh Head PMO.",
  "defect.reject": "Penetapan gangguan operasional dilakukan oleh Head ISO atau Head PMO.",
  "defect.fix": "Perbaikan cacat bawaan dicatat oleh Delivery Control proyek ini.",
  "defect.close": "Cacat bawaan ditutup oleh Head PMO.",
  close: "Penutupan proyek dinyatakan oleh Head PMO.",
};

/** The project, checked against the actor's right to take `action`. */
async function load(projectId: string, action: WarrantyAction) {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(projectId).success) return { fail: { ok: false, message: "Permintaan tidak valid." } };
  const [org, [project]] = await Promise.all([loadOrg(), loadProjects(projectId)]);
  if (!project || !canWarranty(user.actor, action, project, org)) return { fail: { ok: false, message: WHO[action] } };
  return { user, project };
}

const WARRANTY_MESSAGE: Record<WarrantyProblem, string> = {
  date: "Tanggal tidak valid.",
  before_bast: "Akhir garansi tidak boleh sebelum tanggal BAST.",
  no_bast: "BAST belum disahkan.",
  closed: "Proyek sudah ditutup.",
};

/** BCD sets the end of the last warranty. With ISO's acceptance in place, the project enters Garansi. */
export async function setWarranty(projectId: string, endsOn: string): Promise<Result> {
  const l = await load(projectId, "warranty.set");
  if (l.fail) return l.fail;
  const problem = warrantyProblems({ status: l.project.status, bastOn: l.project.bast.on }, String(endsOn))[0];
  if (problem) return { ok: false, message: WARRANTY_MESSAGE[problem] };
  const handover = await loadHandover(projectId);
  const status = serviceStage({ status: l.project.status, handoverStatus: handover.status, warrantyEndsOn: endsOn });
  await db.transaction(async (tx) => {
    await tx.update(schema.project).set({ warrantyEndsOn: endsOn, status, updatedAt: new Date() }).where(eq(schema.project.id, projectId));
    await tx.insert(schema.auditLog).values({
      actorUserId: l.user.id,
      action: "project.warranty",
      subjectType: "project",
      subjectId: projectId,
      before: { warrantyEndsOn: l.project.warrantyEndsOn, status: l.project.status },
      after: { warrantyEndsOn: endsOn, status },
    });
  });
  done(projectId);
  return { ok: true, message: status === "Garansi" && l.project.status !== "Garansi" ? "Akhir garansi disimpan; proyek masuk tahap Garansi." : "Akhir garansi disimpan." };
}

const DEFECT_MESSAGE: Record<DefectProblem, string> = {
  wrong_status: "Status laporan tidak sesuai untuk langkah ini.",
  text: "Isi uraiannya terlebih dahulu.",
  not_handed_over: "Cacat bawaan dilaporkan setelah MSO menerima serah terima.",
  WARRANTY_SELF_CLASSIFICATION: "Penetapan cacat bawaan dilakukan bersama Head ISO dan Head PMO, bukan oleh satu orang atau oleh pelapornya.",
};

/** ISO or MSO reports a fault it believes the project left behind. */
export async function reportDefect(projectId: string, input: { description: string; siteId: string | null }): Promise<Result> {
  const parsed = z.object({ description: z.string().max(2000), siteId: z.string().uuid().nullable() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Data laporan tidak valid." };
  const l = await load(projectId, "defect.report");
  if (l.fail) return l.fail;
  if (parsed.data.siteId && !l.project.sites.some((s) => s.id === parsed.data.siteId)) return { ok: false, message: "Lokasi tidak ditemukan." };
  const problem = defectProblems("report", null, l.user.id, { text: parsed.data.description, msoAcceptedOn: l.project.msoAcceptedOn }).problems[0];
  if (problem) return { ok: false, message: DEFECT_MESSAGE[problem] };
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.projectDefect)
      .values({ projectId, siteId: parsed.data.siteId, description: parsed.data.description.trim(), reportedBy: l.user.id })
      .returning({ id: schema.projectDefect.id });
    await tx.insert(schema.auditLog).values({ actorUserId: l.user.id, action: "project_defect.report", subjectType: "project_defect", subjectId: row!.id, after: { projectId, ...parsed.data } });
  });
  done(projectId);
  await notifyProject("defect_reported", l.project, l.user.id);
  return { ok: true, message: "Laporan dicatat; menunggu penetapan Head ISO dan Head PMO." };
}

const STEP: Record<Exclude<DefectAction, "report">, WarrantyAction> = {
  confirm_iso: "defect.confirm_iso",
  confirm_pmo: "defect.confirm_pmo",
  reject: "defect.reject",
  fix: "defect.fix",
  close: "defect.close",
};
const STEP_DONE: Record<Exclude<DefectAction, "report">, string> = {
  confirm_iso: "Penetapan Head ISO dicatat.",
  confirm_pmo: "Penetapan Head PMO dicatat.",
  reject: "Ditetapkan sebagai gangguan operasional.",
  fix: "Perbaikan dicatat; menunggu Head PMO menutup.",
  close: "Cacat bawaan ditutup.",
};

/** One step on a reported fault: confirm it as inherited, set it aside as operational, record the repair, close it. */
export async function defectStep(projectId: string, defectId: string, action: Exclude<DefectAction, "report">, text = ""): Promise<Result> {
  const parsed = z.object({ defectId: z.string().uuid(), action: z.enum(["confirm_iso", "confirm_pmo", "reject", "fix", "close"]), text: z.string().max(2000) }).safeParse({ defectId, action, text });
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const l = await load(projectId, STEP[action]);
  if (l.fail) return l.fail;
  const defect = (await loadDefects(projectId)).find((d) => d.id === defectId);
  if (!defect) return { ok: false, message: "Laporan tidak ditemukan." };
  const { problems, next } = defectProblems(action, defect, l.user.id, { text });
  if (problems[0]) return { ok: false, message: DEFECT_MESSAGE[problems[0]] };

  const now = new Date();
  const note = text.trim();
  const values =
    action === "confirm_iso"
      ? { confirmedIsoBy: l.user.id }
      : action === "confirm_pmo"
        ? { confirmedPmoBy: l.user.id }
        : action === "reject"
          ? { rejectNote: note, rejectedBy: l.user.id }
          : action === "fix"
            ? { fixNote: note, fixedBy: l.user.id, fixedAt: now }
            : { closedBy: l.user.id, closedAt: now };
  await db.transaction(async (tx) => {
    await tx.update(schema.projectDefect).set({ ...values, status: next }).where(eq(schema.projectDefect.id, defectId));
    await tx.insert(schema.auditLog).values({ actorUserId: l.user.id, action: `project_defect.${action}`, subjectType: "project_defect", subjectId: defectId, before: { status: defect.status }, after: { ...values, status: next } });
  });
  done(projectId);
  if (next === "Cacat_Bawaan" && action.startsWith("confirm")) await notifyProject("defect_inherited", l.project, l.user.id);
  return { ok: true, message: action.startsWith("confirm") && next === "Cacat_Bawaan" ? "Ditetapkan sebagai cacat bawaan proyek; ditangani Delivery Control." : STEP_DONE[action] };
}

const CLOSURE_MESSAGE: Record<ClosureProblem, string> = {
  closed: "Proyek sudah ditutup.",
  not_accepted: "MSO belum menyatakan menerima serah terima.",
  iso: "ISO belum menerima turunan teknis.",
  warranty_unset: "Tanggal akhir garansi belum diisi.",
  warranty_running: "Masa garansi belum berakhir.",
  defects_open: "Masih ada cacat bawaan yang terbuka.",
};

/** The Head PMO declares the project closed: after MSO and ISO accepted, the warranty ended and no defect is open. */
export async function closeProject(projectId: string): Promise<Result> {
  const l = await load(projectId, "close");
  if (l.fail) return l.fail;
  const [handover, defects] = await Promise.all([loadHandover(projectId), loadDefects(projectId)]);
  const today = todayJakarta();
  const problem = closureProblems({ ...l.project, handoverStatus: handover.status, defects }, today)[0];
  if (problem) return { ok: false, message: CLOSURE_MESSAGE[problem] };
  await db.transaction(async (tx) => {
    await tx.update(schema.project).set({ status: "Closing", closedOn: today, closedBy: l.user.id, updatedAt: new Date() }).where(eq(schema.project.id, projectId));
    await tx.update(schema.projectHandover).set({ status: "Selesai", updatedAt: new Date() }).where(eq(schema.projectHandover.projectId, projectId));
    await tx.insert(schema.auditLog).values({ actorUserId: l.user.id, action: "project.close", subjectType: "project", subjectId: projectId, before: { status: l.project.status }, after: { status: "Closing", closedOn: today } });
  });
  done(projectId);
  return { ok: true, message: "Proyek ditutup." };
}
