import "server-only";
import { asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { DELIVERY_UNIT, type DefectStatus, type HandoverStatus, type ProjectStatus, type ProjectTeam, type SiteBai, type SiteInput } from "@estrada/domain";
import { loadOrg } from "./workflow";

export interface SiteRow extends SiteInput {
  id: string;
  bai: SiteBai | null;
  /** Why the last BAI was sent back. */
  baiReturnNote: string | null;
}

/** A declaration awaiting, or carrying, the Head PMO's approval. */
export interface Signoff {
  /** The approved date; null until approved. */
  on: string | null;
  proposedOn: string | null;
  proposedBy: string | null;
  number?: string | null;
}

export interface ProjectRow {
  id: string;
  dealId: string;
  /** The deal's project name: the Kode Proyek. */
  name: string;
  customer: string;
  endCustomer: string | null;
  entity: string;
  fiscalYear: number;
  status: ProjectStatus;
  contractSites: number;
  rfs: Signoff;
  bast: Signoff;
  /** The date MSO accepted the handover: when responsibility for the service moved. */
  msoAcceptedOn: string | null;
  warrantyEndsOn: string | null;
  closedOn: string | null;
  team: ProjectTeam;
  sites: SiteRow[];
}

const toSite = (s: typeof schema.projectSite.$inferSelect): SiteRow => ({
  id: s.id,
  kode: s.code,
  nama: s.name,
  alamat: s.address,
  wilayah: s.region,
  picNama: s.customerPicName,
  picKontak: s.customerPicContact,
  status: s.status,
  tglPlanSelesai: s.plannedDoneOn,
  tglAktualSelesai: s.actualDoneOn,
  ujiPetik: s.spotCheck,
  bai:
    s.baiNumber && s.baiOn && s.baiCollectedBy
      ? { nomor: s.baiNumber, tanggal: s.baiOn, evidence: s.baiEvidence ?? "", collectedBy: s.baiCollectedBy, compiledBy: s.baiCompiledBy, verifiedBy: s.baiVerifiedBy, spotCheckPassed: s.spotCheckPassed }
      : null,
  baiReturnNote: s.baiReturnNote,
});

/** Every project with its sites, newest first; one project when `id` is given. */
export async function loadProjects(id?: string): Promise<ProjectRow[]> {
  const rows = await db
    .select({ project: schema.project, deal: schema.pipelineDeal })
    .from(schema.project)
    .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.project.dealId))
    .where(id ? eq(schema.project.id, id) : undefined)
    .orderBy(desc(schema.project.createdAt));
  const sites = rows.length
    ? await db
        .select()
        .from(schema.projectSite)
        .where(inArray(schema.projectSite.projectId, rows.map((r) => r.project.id)))
        .orderBy(asc(schema.projectSite.code))
    : [];
  const byProject = Map.groupBy(sites, (s) => s.projectId);
  return rows.map(({ project: p, deal: d }) => ({
    id: p.id,
    dealId: d.id,
    name: d.project,
    customer: d.customer,
    endCustomer: d.endCustomer,
    entity: d.entityCode,
    fiscalYear: d.fiscalYear,
    status: p.status,
    contractSites: p.contractSites,
    rfs: { on: p.rfsOn, proposedOn: p.rfsProposedOn, proposedBy: p.rfsProposedBy },
    bast: { on: p.bastOn, proposedOn: p.bastProposedOn, proposedBy: p.bastProposedBy, number: p.bastNumber },
    msoAcceptedOn: p.msoAcceptedOn,
    warrantyEndsOn: p.warrantyEndsOn,
    closedOn: p.closedOn,
    team: { pm: p.pmUserId, deliveryControl: p.deliveryControlUserId, projectAdmin: p.projectAdminUserId },
    sites: (byProject.get(p.id) ?? []).map(toSite),
  }));
}

export interface Person {
  id: string;
  name: string;
  title: string;
}

/** Display names for the user ids on a project: who collected a BAI, who declared RFS. */
export async function userNames(ids: readonly (string | null | undefined)[]): Promise<Record<string, string>> {
  const wanted = [...new Set(ids.filter((i): i is string => !!i))];
  if (!wanted.length) return {};
  const rows = await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(inArray(schema.user.id, wanted));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

/** People seated within PMO: the only candidates for a project's team. */
export async function deliveryPeople(): Promise<Person[]> {
  const [org, seats] = await Promise.all([
    loadOrg(),
    db
      .select({ id: schema.user.id, name: schema.user.name, title: schema.position.title, unit: schema.position.orgUnitCode })
      .from(schema.position)
      .innerJoin(schema.user, eq(schema.user.id, schema.position.holderUserId))
      .where(isNotNull(schema.position.holderUserId))
      .orderBy(asc(schema.user.name)),
  ]);
  const seen = new Set<string>();
  return seats.filter((s) => org.isWithin(s.unit, DELIVERY_UNIT) && !seen.has(s.id) && seen.add(s.id)).map(({ id, name, title }) => ({ id, name, title }));
}

/** Closed Won deals that have no project yet. */
export async function dealsAwaitingProject() {
  const [deals, opened] = await Promise.all([
    db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.status, "CW")).orderBy(desc(schema.pipelineDeal.fiscalYear), asc(schema.pipelineDeal.project)),
    db.select({ dealId: schema.project.dealId }).from(schema.project),
  ]);
  const has = new Set(opened.map((o) => o.dealId));
  return deals.filter((d) => !has.has(d.id)).map((d) => ({ id: d.id, name: d.project, customer: d.customer, entity: d.entityCode, fiscalYear: d.fiscalYear }));
}

export interface HandoverRow {
  status: HandoverStatus;
  hasApplication: boolean;
  submittedBy: string | null;
  criteria: Record<string, boolean>;
  checklist: Record<string, boolean>;
  checklistBy: string | null;
  msoAcceptedBy: string | null;
  isoAcceptedBy: string | null;
  returnNote: string | null;
  /** Where each artefact is kept, by its number in the catalogue. */
  artefacts: Record<number, string>;
}

/** A project's handover package; an untouched draft when nothing has been saved yet. */
export async function loadHandover(projectId: string): Promise<HandoverRow> {
  const [[row], artefacts] = await Promise.all([
    db.select().from(schema.projectHandover).where(eq(schema.projectHandover.projectId, projectId)),
    db.select().from(schema.handoverArtefact).where(eq(schema.handoverArtefact.projectId, projectId)),
  ]);
  return {
    status: row?.status ?? "Disusun",
    hasApplication: row?.hasApplication ?? false,
    submittedBy: row?.submittedBy ?? null,
    criteria: row?.criteria ?? {},
    checklist: row?.checklist ?? {},
    checklistBy: row?.checklistBy ?? null,
    msoAcceptedBy: row?.msoAcceptedBy ?? null,
    isoAcceptedBy: row?.isoAcceptedBy ?? null,
    returnNote: row?.returnNote ?? null,
    artefacts: Object.fromEntries(artefacts.map((a) => [a.no, a.reference])),
  };
}

export interface DefectRow {
  id: string;
  siteId: string | null;
  description: string;
  status: DefectStatus;
  reportedBy: string;
  reportedAt: Date;
  confirmedIso: string | null;
  confirmedPmo: string | null;
  rejectNote: string | null;
  fixNote: string | null;
}

/** Faults reported against a project during warranty, oldest first. */
export async function loadDefects(projectId: string): Promise<DefectRow[]> {
  const rows = await db.select().from(schema.projectDefect).where(eq(schema.projectDefect.projectId, projectId)).orderBy(asc(schema.projectDefect.reportedAt));
  return rows.map((d) => ({
    id: d.id,
    siteId: d.siteId,
    description: d.description,
    status: d.status,
    reportedBy: d.reportedBy,
    reportedAt: d.reportedAt,
    confirmedIso: d.confirmedIsoBy,
    confirmedPmo: d.confirmedPmoBy,
    rejectNote: d.rejectNote,
    fixNote: d.fixNote,
  }));
}
