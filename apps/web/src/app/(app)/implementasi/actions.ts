"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import {
  FIELD_SITE_STATUSES,
  SITE_STATUSES,
  baiProblems,
  baiReturnProblems,
  bastProblems,
  canOpenProject,
  canProject,
  rfsProblems,
  signoffProblems,
  siteProblems,
  statusAfterSite,
  teamProblems,
  type BaiProblem,
  type BaiStep,
  type SiteProblem,
  type TeamProblem,
} from "@estrada/domain";
import { deliveryPeople, loadProjects } from "@/lib/implementasi";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const done = (id?: string) => {
  revalidatePath("/implementasi");
  if (id) revalidatePath(`/implementasi/${id}`);
};

/** Opens a project from a Closed Won deal. BCD's people, within their entities (Kewenangan A row 1). */
export async function openProject(dealId: string, contractSites: number): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ dealId: z.string().uuid(), contractSites: z.number().int().min(1).max(100000) }).safeParse({ dealId, contractSites });
  if (!parsed.success) return { ok: false, message: "Isi jumlah lokasi kontrak, minimal 1." };
  const org = await loadOrg();
  const [deal] = await db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.id, dealId));
  if (!deal || !canProject(user.actor, "open", { entity: deal.entityCode, team: null }, org)) return { ok: false, message: "Proyek dibuka oleh BCD untuk entitasnya." };
  if (!canOpenProject(deal)) return { ok: false, message: "Proyek hanya dibuka dari deal berstatus Closed Won." };
  const [existing] = await db.select({ id: schema.project.id }).from(schema.project).where(eq(schema.project.dealId, dealId));
  if (existing) return { ok: false, message: "Deal ini sudah memiliki proyek." };

  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.project).values({ dealId, contractSites: parsed.data.contractSites, createdBy: user.id }).returning({ id: schema.project.id });
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "project.open", subjectType: "project", subjectId: row!.id, after: { dealId, contractSites: parsed.data.contractSites } });
    return row!.id;
  });
  done(id);
  return { ok: true, message: "Proyek dibuka." };
}

const TEAM_MESSAGE: Record<TeamProblem, string> = {
  SELF_VERIFICATION_NOT_ALLOWED: "Delivery Control tidak boleh merangkap Project Manager: pelaksana instalasi tidak memverifikasi hasilnya sendiri.",
  BAI_MAKER_CHECKER: "Delivery Control tidak boleh merangkap Project Admin: pengumpul BAI bukan pengompilasinya.",
};

const Team = z.object({ pm: z.string().min(1).nullable(), deliveryControl: z.string().min(1).nullable(), projectAdmin: z.string().min(1).nullable() });

/** The Head PMO assigns the Project Manager, Delivery Control and Project Admin (Kewenangan A row 3). */
export async function assignTeam(projectId: string, team: z.input<typeof Team>): Promise<Result> {
  const user = await requireUser();
  const parsed = Team.safeParse(team);
  if (!z.string().uuid().safeParse(projectId).success || !parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const [org, [project], people] = await Promise.all([loadOrg(), loadProjects(projectId), deliveryPeople()]);
  if (!project || !canProject(user.actor, "assign", project, org)) return { ok: false, message: "Tim proyek ditetapkan oleh Head PMO." };
  const ids = new Set(people.map((p) => p.id));
  if (Object.values(parsed.data).some((id) => id && !ids.has(id))) return { ok: false, message: "Anggota tim harus orang PMO." };
  const problem = teamProblems(parsed.data)[0];
  if (problem) return { ok: false, message: TEAM_MESSAGE[problem] };

  await db.transaction(async (tx) => {
    await tx
      .update(schema.project)
      .set({ pmUserId: parsed.data.pm, deliveryControlUserId: parsed.data.deliveryControl, projectAdminUserId: parsed.data.projectAdmin, updatedAt: new Date() })
      .where(eq(schema.project.id, projectId));
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "project.assign", subjectType: "project", subjectId: projectId, before: project.team, after: parsed.data });
  });
  done(projectId);
  return { ok: true, message: "Tim proyek disimpan." };
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Site = z.object({
  id: z.string().uuid().nullable(),
  kode: z.string().max(60),
  nama: z.string().max(200),
  alamat: z.string().max(1000),
  wilayah: z.string().max(100).nullable().optional(),
  picNama: z.string().max(200).nullable().optional(),
  picKontak: z.string().max(200).nullable().optional(),
  status: z.enum(SITE_STATUSES),
  tglPlanSelesai: date,
  tglAktualSelesai: date.nullable().optional(),
  ujiPetik: z.boolean().optional(),
});

const SITE_MESSAGE: Partial<Record<`${SiteProblem["field"]}:${SiteProblem["code"]}`, string>> = {
  "kode:required": "Kode lokasi wajib diisi.",
  "kode:duplicate": "Kode lokasi sudah dipakai di proyek ini.",
  "kode:over_contract": "Jumlah lokasi sudah sama dengan jumlah lokasi kontrak.",
  "nama:required": "Nama lokasi wajib diisi.",
  "alamat:required": "Alamat wajib diisi.",
  "status:not_manual": "Status BAI dan Selesai mengikuti BAI lokasi, tidak dipilih manual.",
  "tglPlanSelesai:invalid": "Tanggal rencana selesai tidak valid.",
  "tglAktualSelesai:invalid": "Tanggal aktual selesai tidak valid.",
};

/** Registers a site (Project Manager) or updates it (Project Manager, Project Admin): Kewenangan A row 7. */
export async function saveSite(projectId: string, input: z.input<typeof Site>): Promise<Result> {
  const user = await requireUser();
  const parsed = Site.safeParse(input);
  if (!z.string().uuid().safeParse(projectId).success || !parsed.success) return { ok: false, message: "Data lokasi tidak valid." };
  const { id, ...site } = parsed.data;
  const [org, [project]] = await Promise.all([loadOrg(), loadProjects(projectId)]);
  if (!project || !canProject(user.actor, id ? "site.edit" : "site.add", project, org)) {
    return { ok: false, message: id ? "Lokasi diubah oleh Project Manager atau Project Admin proyek ini." : "Lokasi didaftarkan oleh Project Manager proyek ini." };
  }
  const before = id ? project.sites.find((s) => s.id === id) : undefined;
  if (id && !before) return { ok: false, message: "Lokasi tidak ditemukan." };
  // Once the BAI sets the status, it is no longer chosen by hand: the rest of the site stays editable.
  const locked = !!before && !(FIELD_SITE_STATUSES as readonly string[]).includes(before.status);
  const problem = siteProblems(locked ? { ...site, status: "Uji" } : site, project.sites.filter((s) => s.id !== id), project.contractSites)[0];
  if (problem) return { ok: false, message: SITE_MESSAGE[`${problem.field}:${problem.code}`] ?? "Data lokasi tidak valid." };

  const values = {
    code: site.kode.trim(),
    name: site.nama.trim(),
    address: site.alamat.trim(),
    region: site.wilayah?.trim() || null,
    customerPicName: site.picNama?.trim() || null,
    customerPicContact: site.picKontak?.trim() || null,
    status: locked ? before!.status : site.status,
    plannedDoneOn: site.tglPlanSelesai,
    actualDoneOn: site.tglAktualSelesai || null,
    spotCheck: site.ujiPetik ?? false,
  };
  const status = statusAfterSite(project.status, values.status);
  await db.transaction(async (tx) => {
    if (status !== project.status) {
      await tx.update(schema.project).set({ status, updatedAt: new Date() }).where(eq(schema.project.id, projectId));
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "project.status", subjectType: "project", subjectId: projectId, before: { status: project.status }, after: { status } });
    }
    if (id) {
      await tx.update(schema.projectSite).set({ ...values, updatedAt: new Date() }).where(eq(schema.projectSite.id, id));
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "project_site.update", subjectType: "project_site", subjectId: id, before, after: values });
    } else {
      const [row] = await tx.insert(schema.projectSite).values({ ...values, projectId, createdBy: user.id }).returning({ id: schema.projectSite.id });
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "project_site.create", subjectType: "project_site", subjectId: row!.id, after: { ...values, projectId } });
    }
  });
  done(projectId);
  return { ok: true, message: "Lokasi disimpan." };
}

const BAI_MESSAGE: Record<BaiProblem, string> = {
  wrong_status: "Status lokasi tidak sesuai untuk langkah BAI ini.",
  nomor: "Nomor BAI wajib diisi.",
  tanggal: "Tanggal BAI tidak valid.",
  evidence: "Rujukan evidence wajib diisi.",
  spot_check: "Lokasi ini sampel uji petik: nyatakan uji petik lulus sebelum BAI dikompilasi.",
  BAI_MAKER_CHECKER: "Satu orang tidak boleh memegang dua langkah BAI yang sama: pengumpul, pengompilasi dan verifikator harus berbeda.",
};
const BAI_ACTION = { collect: "bai.collect", compile: "bai.compile", verify: "bai.verify" } as const;
const BAI_WHO: Record<BaiStep, string> = {
  collect: "BAI dikumpulkan oleh Delivery Control proyek ini.",
  compile: "BAI dikompilasi oleh Project Admin proyek ini.",
  verify: "BAI diverifikasi oleh Assurance (BCD) untuk entitasnya.",
};

const Bai = z.object({
  step: z.enum(["collect", "compile", "verify"]),
  nomor: z.string().max(100).optional(),
  tanggal: z.string().max(10).optional(),
  evidence: z.string().max(500).optional(),
  spotCheckPassed: z.boolean().optional(),
});

/** One step of a site's BAI: collected by Delivery Control, compiled by the Project Admin, verified by Assurance. */
export async function baiStep(projectId: string, siteId: string, input: z.input<typeof Bai>): Promise<Result> {
  const user = await requireUser();
  const parsed = Bai.safeParse(input);
  if (!z.string().uuid().safeParse(projectId).success || !z.string().uuid().safeParse(siteId).success || !parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const { step, ...data } = parsed.data;
  const [org, [project]] = await Promise.all([loadOrg(), loadProjects(projectId)]);
  if (!project || !canProject(user.actor, BAI_ACTION[step], project, org)) return { ok: false, message: BAI_WHO[step] };
  const site = project.sites.find((s) => s.id === siteId);
  if (!site) return { ok: false, message: "Lokasi tidak ditemukan." };
  const { problems, next } = baiProblems(step, site, user.id, data);
  if (problems[0]) return { ok: false, message: BAI_MESSAGE[problems[0]] };

  const now = new Date();
  const values =
    step === "collect"
      ? { baiNumber: data.nomor!.trim(), baiOn: data.tanggal!, baiEvidence: data.evidence!.trim(), baiCollectedBy: user.id, baiCollectedAt: now, baiCompiledBy: null, baiCompiledAt: null, baiVerifiedBy: null, baiVerifiedAt: null, baiReturnNote: null, spotCheckPassed: null }
      : step === "compile"
        ? { baiCompiledBy: user.id, baiCompiledAt: now, spotCheckPassed: site.ujiPetik ? true : null }
        : // A verified site is finished: without an actual finish date it would keep counting as late.
          { baiVerifiedBy: user.id, baiVerifiedAt: now, actualDoneOn: site.tglAktualSelesai || site.bai!.tanggal };
  await db.transaction(async (tx) => {
    await tx.update(schema.projectSite).set({ ...values, status: next, updatedAt: now }).where(eq(schema.projectSite.id, siteId));
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: `project_site.bai_${step}`, subjectType: "project_site", subjectId: siteId, before: { status: site.status, bai: site.bai }, after: { ...values, status: next } });
  });
  done(projectId);
  return { ok: true, message: step === "collect" ? "BAI dicatat." : step === "compile" ? "BAI dikompilasi." : "BAI terverifikasi; lokasi selesai." };
}

/** Sends a BAI back to be collected again: the Project Admin before compiling, Assurance before verifying. */
export async function returnBai(projectId: string, siteId: string, note: string): Promise<Result> {
  const user = await requireUser();
  const text = z.string().max(1000).safeParse(note);
  if (!z.string().uuid().safeParse(projectId).success || !z.string().uuid().safeParse(siteId).success || !text.success) return { ok: false, message: "Permintaan tidak valid." };
  const [org, [project]] = await Promise.all([loadOrg(), loadProjects(projectId)]);
  const site = project?.sites.find((s) => s.id === siteId);
  if (!project || !site) return { ok: false, message: "Lokasi tidak ditemukan." };
  const problem = baiReturnProblems(site, text.data)[0];
  if (problem) return { ok: false, message: problem === "note" ? "Tulis alasan pengembalian." : "BAI lokasi ini tidak sedang diproses." };
  const step: BaiStep = site.status === "BAI_Terbit" ? "compile" : "verify";
  if (!canProject(user.actor, BAI_ACTION[step], project, org)) return { ok: false, message: BAI_WHO[step] };

  const values = { status: "Uji" as const, baiNumber: null, baiOn: null, baiEvidence: null, baiCollectedBy: null, baiCollectedAt: null, baiCompiledBy: null, baiCompiledAt: null, spotCheckPassed: null, baiReturnNote: text.data.trim() };
  await db.transaction(async (tx) => {
    await tx.update(schema.projectSite).set({ ...values, updatedAt: new Date() }).where(eq(schema.projectSite.id, siteId));
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "project_site.bai_return", subjectType: "project_site", subjectId: siteId, before: { status: site.status, bai: site.bai }, after: values });
  });
  done(projectId);
  return { ok: true, message: "BAI dikembalikan ke Delivery Control." };
}

const SIGNOFF_MESSAGE = {
  date: "Tanggal tidak valid.",
  number: "Nomor BAST wajib diisi.",
  SELF_APPROVAL_NOT_ALLOWED: "Pengaju tidak boleh mengesahkan pengajuannya sendiri.",
  sites_missing: "Belum semua lokasi kontrak terdaftar.",
  sites_untested: "Masih ada lokasi yang belum lulus uji atau terkendala.",
  rfs: "RFS belum disahkan.",
  bai_incomplete: "Jumlah BAI terverifikasi belum sama dengan jumlah lokasi kontrak.",
};

/** The Project Manager declares RFS; it takes effect when the Head PMO approves it. */
export async function declareRfs(projectId: string, on: string): Promise<Result> {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(projectId).success || typeof on !== "string") return { ok: false, message: "Permintaan tidak valid." };
  const [org, [project]] = await Promise.all([loadOrg(), loadProjects(projectId)]);
  if (!project || !canProject(user.actor, "rfs.declare", project, org)) return { ok: false, message: "RFS dinyatakan oleh Project Manager proyek ini." };
  if (project.rfs.on) return { ok: false, message: "RFS sudah disahkan." };
  const problem = signoffProblems("rfs", { on })[0] ?? rfsProblems(project)[0];
  if (problem) return { ok: false, message: SIGNOFF_MESSAGE[problem] };
  await db.transaction(async (tx) => {
    await tx.update(schema.project).set({ rfsProposedOn: on, rfsProposedBy: user.id, updatedAt: new Date() }).where(eq(schema.project.id, projectId));
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "project.rfs_declare", subjectType: "project", subjectId: projectId, before: project.rfs, after: { proposedOn: on } });
  });
  done(projectId);
  return { ok: true, message: "RFS dinyatakan; menunggu pengesahan Head PMO." };
}

/** The Project Admin prepares the BAST; it takes effect when the Head PMO approves it. */
export async function prepareBast(projectId: string, number: string, on: string): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ number: z.string().max(100), on: z.string().max(10) }).safeParse({ number, on });
  if (!z.string().uuid().safeParse(projectId).success || !parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const [org, [project]] = await Promise.all([loadOrg(), loadProjects(projectId)]);
  if (!project || !canProject(user.actor, "bast.prepare", project, org)) return { ok: false, message: "BAST disiapkan oleh Project Admin proyek ini." };
  if (project.bast.on) return { ok: false, message: "BAST sudah disahkan." };
  const problem = signoffProblems("bast", parsed.data)[0] ?? bastProblems({ ...project, rfsOn: project.rfs.on })[0];
  if (problem) return { ok: false, message: SIGNOFF_MESSAGE[problem] };
  await db.transaction(async (tx) => {
    await tx.update(schema.project).set({ bastNumber: parsed.data.number.trim(), bastProposedOn: on, bastProposedBy: user.id, updatedAt: new Date() }).where(eq(schema.project.id, projectId));
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "project.bast_prepare", subjectType: "project", subjectId: projectId, before: project.bast, after: { number: parsed.data.number.trim(), proposedOn: on } });
  });
  done(projectId);
  return { ok: true, message: "BAST disiapkan; menunggu pengesahan Head PMO." };
}

/** The Head PMO approves a declared RFS or a prepared BAST. An approved BAST moves the project to Penagihan. */
export async function approveSignoff(projectId: string, kind: "rfs" | "bast"): Promise<Result> {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(projectId).success || (kind !== "rfs" && kind !== "bast")) return { ok: false, message: "Permintaan tidak valid." };
  const [org, [project]] = await Promise.all([loadOrg(), loadProjects(projectId)]);
  if (!project || !canProject(user.actor, `${kind}.approve`, project, org)) return { ok: false, message: "Pengesahan dilakukan oleh Head PMO." };
  const signoff = project[kind];
  if (signoff.on) return { ok: false, message: "Sudah disahkan." };
  if (!signoff.proposedOn) return { ok: false, message: kind === "rfs" ? "RFS belum dinyatakan Project Manager." : "BAST belum disiapkan Project Admin." };
  const problem =
    signoffProblems(kind, { on: signoff.proposedOn, number: signoff.number }, { proposedBy: signoff.proposedBy, approver: user.id })[0] ??
    (kind === "rfs" ? rfsProblems(project)[0] : bastProblems({ ...project, rfsOn: project.rfs.on })[0]);
  if (problem) return { ok: false, message: SIGNOFF_MESSAGE[problem] };

  const values = kind === "rfs" ? { rfsOn: signoff.proposedOn } : { bastOn: signoff.proposedOn, status: "Penagihan" as const };
  await db.transaction(async (tx) => {
    await tx.update(schema.project).set({ ...values, updatedAt: new Date() }).where(eq(schema.project.id, projectId));
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: `project.${kind}_approve`, subjectType: "project", subjectId: projectId, before: { ...signoff, status: project.status }, after: values });
  });
  done(projectId);
  return { ok: true, message: kind === "rfs" ? "RFS disahkan." : "BAST disahkan; proyek masuk tahap Penagihan." };
}
