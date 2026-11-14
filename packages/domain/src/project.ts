import { money, ZERO, type Money } from "./money";
import type { OrgTree } from "./org";
import { canPipeline, type DealStatus } from "./pipeline";
import type { Actor } from "./policy";
import type { Role } from "./roles";

/** The department that delivers projects, and the division whose units read them (Modul Implementasi, sheet 09). */
export const DELIVERY_UNIT = "PMO";
export const DELIVERY_DIVISION = "PDMS";

/** Kamus Field A row 1. Layanan and Garansi sit between Penagihan and Closing. */
export const PROJECT_STATUSES = ["Initiation", "Pengadaan_Barang", "Implementasi", "Penagihan", "Layanan", "Garansi", "Closing", "Drop"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  Initiation: "Initiation",
  Pengadaan_Barang: "Pengadaan Barang",
  Implementasi: "Implementasi",
  Penagihan: "Penagihan",
  Layanan: "Layanan",
  Garansi: "Garansi",
  Closing: "Closing",
  Drop: "Drop",
};

/** Kamus Field B row 9. These are what is counted into the project's progress. */
export const SITE_STATUSES = ["Belum_Mulai", "Survei", "Staging", "Dikirim", "Instalasi", "Uji", "BAI_Terbit", "BAI_Terverifikasi", "Selesai", "Terkendala"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];
export const SITE_STATUS_LABEL: Record<SiteStatus, string> = {
  Belum_Mulai: "Belum mulai",
  Survei: "Survei",
  Staging: "Staging",
  Dikirim: "Dikirim",
  Instalasi: "Instalasi",
  Uji: "Uji",
  BAI_Terbit: "BAI terbit",
  BAI_Terverifikasi: "BAI terverifikasi",
  Selesai: "Selesai",
  Terkendala: "Terkendala",
};
/** Statuses set by hand. BAI_Terbit, BAI_Terverifikasi and Selesai follow from the site's BAI, never from a dropdown. */
export const FIELD_SITE_STATUSES = ["Belum_Mulai", "Survei", "Staging", "Dikirim", "Instalasi", "Uji", "Terkendala"] as const satisfies readonly SiteStatus[];

/** A project is opened once the contract is signed: from a Closed Won deal. */
export const canOpenProject = (deal: { status: DealStatus }): boolean => deal.status === "CW";

/** A service location of the contract; dates as YYYY-MM-DD. */
export interface SiteInput {
  kode: string;
  nama: string;
  alamat: string;
  wilayah?: string | null;
  picNama?: string | null;
  picKontak?: string | null;
  status: SiteStatus;
  /** From the baseline the Head PMO approved; the basis of delay. */
  tglPlanSelesai: string;
  tglAktualSelesai?: string | null;
  /** Chosen as a sample for uji petik. */
  ujiPetik?: boolean;
}

export interface SiteProblem {
  field: "kode" | "nama" | "alamat" | "status" | "tglPlanSelesai" | "tglAktualSelesai";
  code: "required" | "duplicate" | "over_contract" | "invalid" | "not_manual";
}

const isDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
};

const siteKey = (kode: string) => kode.trim().replace(/\s+/g, " ").toLowerCase();

/** `others` are the project's other sites, excluding the site itself; `contractSites` is jumlah_site_kontrak. */
export function siteProblems(s: SiteInput, others: readonly { kode: string }[], contractSites: number): SiteProblem[] {
  const out: SiteProblem[] = [];
  if (!s.kode.trim()) out.push({ field: "kode", code: "required" });
  else if (others.some((o) => siteKey(o.kode) === siteKey(s.kode))) out.push({ field: "kode", code: "duplicate" });
  else if (others.length >= contractSites) out.push({ field: "kode", code: "over_contract" });
  if (!s.nama.trim()) out.push({ field: "nama", code: "required" });
  if (!s.alamat.trim()) out.push({ field: "alamat", code: "required" });
  if (!(FIELD_SITE_STATUSES as readonly string[]).includes(s.status)) out.push({ field: "status", code: "not_manual" });
  if (!isDate(s.tglPlanSelesai)) out.push({ field: "tglPlanSelesai", code: "invalid" });
  if (s.tglAktualSelesai && !isDate(s.tglAktualSelesai)) out.push({ field: "tglAktualSelesai", code: "invalid" });
  return out;
}

export interface ProjectProgress {
  /** Sites with status Selesai. */
  done: number;
  /** jumlah_site_kontrak: the divisor, whatever has been registered so far. */
  total: number;
  registered: number;
  /** Percent, 0–100. */
  pct: Money;
}

/** Progress = sites finished over the contract's sites, not milestones finished over six. */
export function projectProgress(sites: readonly { status: SiteStatus }[], contractSites: number): ProjectProgress {
  const done = sites.filter((s) => s.status === "Selesai").length;
  return { done, total: contractSites, registered: sites.length, pct: contractSites > 0 ? money(done).times(100).div(contractSites) : ZERO };
}

const dayNumber = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86_400_000;

/** Days past the plan date: up to the actual finish, or up to `today` while unfinished. Computed, never typed. */
export function delayDays(site: Pick<SiteInput, "tglPlanSelesai" | "tglAktualSelesai">, today: string): number {
  return Math.max(0, dayNumber(site.tglAktualSelesai || today) - dayNumber(site.tglPlanSelesai));
}

/** The PMO people assigned to a project, by user id. */
export interface ProjectTeam {
  pm: string | null;
  deliveryControl: string | null;
  projectAdmin: string | null;
}

export type TeamProblem = "SELF_VERIFICATION_NOT_ALLOWED" | "BAI_MAKER_CHECKER";

/**
 * Larangan rangkap peran: Delivery Control installs and collects the BAI, so it is neither the Project Manager who
 * verifies the installation nor the Project Admin who compiles the BAI.
 */
export function teamProblems(team: ProjectTeam): TeamProblem[] {
  const out: TeamProblem[] = [];
  if (team.deliveryControl && team.deliveryControl === team.pm) out.push("SELF_VERIFICATION_NOT_ALLOWED");
  if (team.deliveryControl && team.deliveryControl === team.projectAdmin) out.push("BAI_MAKER_CHECKER");
  return out;
}

export type ProjectAction = "view" | "open" | "assign" | "site.add" | "site.edit" | "bai.collect" | "bai.compile" | "bai.verify" | "rfs.declare" | "rfs.approve" | "bast.prepare" | "bast.approve" | "site.delete" | "contract.change" | "drop" | "telkom.record";

const HEADS: readonly Role[] = ["default_owner", "division_owner"];
const READERS: readonly Role[] = ["finance", "director", "auditor"];

/** The Head PMO, or a head above PMO (Head PDMS). */
export const isDeliveryHead = (actor: Actor, org: OrgTree): boolean => HEADS.includes(actor.role) && org.isWithin(DELIVERY_UNIT, actor.orgUnit);

/**
 * Matriks peran (Kewenangan A): BCD opens the project from its contract, the Head PMO assigns the team, the Project
 * Manager registers sites and the Project Admin updates them. Delivery Control collects each site's BAI, the Project
 * Admin compiles it and Assurance (BCD) verifies it. The Project Manager declares RFS, the Project Admin prepares
 * the BAST and the Head PMO approves both. PDMS, BCD, Finance, Direktur and Auditor read.
 * `project` is null for the list, before any project is chosen.
 */
export function canProject(actor: Actor, action: ProjectAction, project: { entity: string; team: ProjectTeam | null; status?: ProjectStatus } | null, org: OrgTree): boolean {
  if (project && !(actor.entities.includes("*") || actor.entities.includes(project.entity))) return false;
  // A dropped or closed project is read-only.
  if (action !== "view" && (project?.status === "Drop" || project?.status === "Closing")) return false;
  switch (action) {
    case "view":
      return READERS.includes(actor.role) || org.isWithin(actor.orgUnit, DELIVERY_DIVISION) || canPipeline(actor, "view", null, org);
    case "open":
      return !!project && canPipeline(actor, "edit", project.entity, org);
    case "assign":
    case "drop":
    case "rfs.approve":
    case "bast.approve":
      return !!project && isDeliveryHead(actor, org);
    case "rfs.declare":
      return !!project?.team && project.team.pm === actor.userId;
    case "bai.collect":
      return !!project?.team && project.team.deliveryControl === actor.userId;
    case "bai.compile":
    case "bast.prepare":
      return !!project?.team && project.team.projectAdmin === actor.userId;
    case "contract.change":
    case "telkom.record":
    case "bai.verify":
      // Assurance sits in Commercial Business, outside PDMS: BCD's people, within their entities.
      return !!project && canPipeline(actor, "edit", project.entity, org);
    case "site.add":
    case "site.delete":
      return !!project?.team && project.team.pm === actor.userId;
    case "site.edit":
      return !!project?.team && (project.team.pm === actor.userId || project.team.projectAdmin === actor.userId);
  }
}

/** A site's BAI: who collected, compiled and verified it, by user id. */
export interface SiteBai {
  nomor: string;
  /** YYYY-MM-DD: the start of the 7-day and 5-day KPI counts. */
  tanggal: string;
  /** Where the technical evidence is kept. */
  evidence: string;
  collectedBy: string;
  compiledBy: string | null;
  verifiedBy: string | null;
  /** Result of uji petik, for a site chosen as a sample. */
  spotCheckPassed: boolean | null;
  /** The days (YYYY-MM-DD) Delivery Control recorded it, the Project Admin compiled it and Assurance verified it. */
  collectedOn?: string | null;
  compiledOn?: string | null;
  verifiedOn?: string | null;
}

export type BaiStep = "collect" | "compile" | "verify";
export type BaiProblem = "wrong_status" | "nomor" | "tanggal" | "evidence" | "spot_check" | "BAI_MAKER_CHECKER";

const BAI_FLOW: Record<BaiStep, { from: SiteStatus; next: SiteStatus }> = {
  collect: { from: "Uji", next: "BAI_Terbit" },
  compile: { from: "BAI_Terbit", next: "BAI_Terverifikasi" },
  verify: { from: "BAI_Terverifikasi", next: "Selesai" },
};

/**
 * Three hands on one document: Delivery Control collects the BAI of a tested site, the Project Admin compiles it and
 * checks the evidence, Assurance verifies it for billing. Nobody takes two of the steps. `next` is the site's status
 * when there are no problems.
 */
export function baiProblems(
  step: BaiStep,
  site: { status: SiteStatus; ujiPetik?: boolean; bai: SiteBai | null },
  actorId: string,
  input: { nomor?: string; tanggal?: string; evidence?: string; spotCheckPassed?: boolean } = {},
): { problems: BaiProblem[]; next: SiteStatus } {
  const { from, next } = BAI_FLOW[step];
  const problems: BaiProblem[] = [];
  if (site.status !== from || (step !== "collect" && !site.bai)) return { problems: ["wrong_status"], next };
  if (step === "collect") {
    if (!input.nomor?.trim()) problems.push("nomor");
    if (!input.tanggal || !isDate(input.tanggal)) problems.push("tanggal");
    if (!input.evidence?.trim()) problems.push("evidence");
    return { problems, next };
  }
  const bai = site.bai!;
  if (actorId === bai.collectedBy || (step === "verify" && actorId === bai.compiledBy)) problems.push("BAI_MAKER_CHECKER");
  if (step === "compile" && site.ujiPetik && !input.spotCheckPassed) problems.push("spot_check");
  return { problems, next };
}

/** A BAI in progress goes back to Uji with a note, to be collected again. */
export function baiReturnProblems(site: { status: SiteStatus }, note: string): ("wrong_status" | "note")[] {
  if (site.status !== "BAI_Terbit" && site.status !== "BAI_Terverifikasi") return ["wrong_status"];
  return note.trim() ? [] : ["note"];
}

const PAST_SURVEY: readonly SiteStatus[] = ["Staging", "Dikirim", "Instalasi", "Uji"];

/** A project enters Implementasi when its first site is past survey; later stages are never pulled back. */
export const statusAfterSite = (project: ProjectStatus, site: SiteStatus): ProjectStatus =>
  (project === "Initiation" || project === "Pengadaan_Barang") && PAST_SURVEY.includes(site) ? "Implementasi" : project;

const TESTED: readonly SiteStatus[] = ["Uji", "BAI_Terbit", "BAI_Terverifikasi", "Selesai"];

/** RFS: every site of the contract is registered, installed and tested. */
export function rfsProblems(p: { contractSites: number; sites: readonly { status: SiteStatus }[] }): ("sites_missing" | "sites_untested")[] {
  if (p.sites.length < p.contractSites) return ["sites_missing"];
  return p.sites.every((s) => TESTED.includes(s.status)) ? [] : ["sites_untested"];
}

/** BAST: RFS is declared and the verified BAI equal the contract's sites. */
export function bastProblems(p: {
  contractSites: number;
  rfsOn: string | null;
  sites: readonly { status: SiteStatus }[];
  /** A TELKOM-scheme customer also needs the BARD and BAUT signed. */
  telkomScheme?: boolean;
  bard?: TelkomDoc | null;
  baut?: TelkomDoc | null;
}): ("rfs" | "bai_incomplete" | "bard" | "baut")[] {
  const out: ("rfs" | "bai_incomplete" | "bard" | "baut")[] = [];
  if (!p.rfsOn) out.push("rfs");
  if (projectProgress(p.sites, p.contractSites).done < p.contractSites) out.push("bai_incomplete");
  if (p.telkomScheme && !p.bard) out.push("bard");
  if (p.telkomScheme && !p.baut) out.push("baut");
  return out;
}

/** BARD or BAUT: the number of the signed document and the day it was signed. */
export interface TelkomDoc {
  nomor: string;
  tanggal: string;
}

export function telkomProblems(doc: TelkomDoc): ("nomor" | "tanggal")[] {
  const out: ("nomor" | "tanggal")[] = [];
  if (!doc.nomor.trim()) out.push("nomor");
  if (!isDate(doc.tanggal)) out.push("tanggal");
  return out;
}

/** A declared RFS or prepared BAST: its date, the BAST's number, and an approver who is not the proposer. */
export function signoffProblems(
  kind: "rfs" | "bast",
  input: { on: string; number?: string | null },
  approval?: { proposedBy: string | null; approver: string },
): ("date" | "number" | "SELF_APPROVAL_NOT_ALLOWED")[] {
  const out: ("date" | "number" | "SELF_APPROVAL_NOT_ALLOWED")[] = [];
  if (!isDate(input.on)) out.push("date");
  if (kind === "bast" && !input.number?.trim()) out.push("number");
  if (approval && approval.proposedBy === approval.approver) out.push("SELF_APPROVAL_NOT_ALLOWED");
  return out;
}

const IN_DELIVERY: readonly ProjectStatus[] = ["Initiation", "Pengadaan_Barang", "Implementasi"];

export type SiteDeleteProblem = "worked_on" | "project_closed_in";

/**
 * A site registered by mistake may be deleted while nothing has happened on it: not started or only surveyed, no BAI,
 * in a project still being delivered. Anything more is evidence and stays.
 */
export function siteDeleteProblems(site: { status: SiteStatus; bai: SiteBai | null }, project: { status: ProjectStatus }): SiteDeleteProblem[] {
  if (!IN_DELIVERY.includes(project.status)) return ["project_closed_in"];
  return site.bai || (site.status !== "Belum_Mulai" && site.status !== "Survei") ? ["worked_on"] : [];
}

export type ContractSitesProblem = "locked" | "count" | "unchanged" | "below_registered" | "reason";

/**
 * Changing jumlah_site_kontrak is a change order: a new whole count not below the sites already registered, with the
 * reason (the addendum), until the BAST is approved.
 */
export function contractSitesProblems(p: { status: ProjectStatus; bastOn: string | null; contractSites: number }, registered: number, next: number, reason: string): ContractSitesProblem[] {
  if (p.bastOn || !IN_DELIVERY.includes(p.status)) return ["locked"];
  if (!Number.isInteger(next) || next < 1) return ["count"];
  if (next === p.contractSites) return ["unchanged"];
  if (next < registered) return ["below_registered"];
  return reason.trim() ? [] : ["reason"];
}

/** Days allowed for each BAI step (Tahap Implementasi B rows 19-21): to record, to compile, to verify. */
export const BAI_TARGETS = { collect: 7, compile: 5, verify: 3 } as const;

export type BaiTimelinessState = "on_time" | "late" | "waiting" | "late_open";
export interface BaiStepTime {
  days: number;
  target: number;
  /** on_time or late once done; waiting or late_open while the step is still open. */
  state: BaiTimelinessState;
}
export type BaiTimeliness = Record<BaiStep, BaiStepTime | null>;

/**
 * How long each BAI step took against its target. Collect counts from the BAI date, compile from collect, verify from
 * compile; a step still open counts up to `today`. A step whose start date is missing is not measured.
 */
export function baiTimeliness(bai: SiteBai | null, today: string): BaiTimeliness {
  const step = (from: string | null | undefined, to: string | null | undefined, target: number): BaiStepTime | null => {
    if (!from) return null;
    const open = !to;
    const days = Math.max(0, dayNumber(to ?? today) - dayNumber(from));
    return { days, target, state: open ? (days > target ? "late_open" : "waiting") : days > target ? "late" : "on_time" };
  };
  if (!bai) return { collect: null, compile: null, verify: null };
  return {
    collect: step(bai.tanggal, bai.collectedOn, BAI_TARGETS.collect),
    compile: step(bai.collectedOn, bai.compiledOn, BAI_TARGETS.compile),
    verify: bai.compiledOn ? step(bai.compiledOn, bai.verifiedOn, BAI_TARGETS.verify) : null,
  };
}

export interface BaiKpiRow {
  /** Sites that reached this step. */
  total: number;
  onTime: number;
  /** Finished late, or still open past the target. */
  late: number;
  /** Open and still inside the target. */
  waiting: number;
  /** On time over (on time + late), one decimal; null when nothing is due yet. */
  pct: number | null;
  /** Average days of the finished steps, one decimal. */
  averageDays: number | null;
}

/** Timeliness per step, so each holder (Delivery Control, Project Admin, Assurance) sees theirs. */
export function baiKpi(sites: readonly { bai: SiteBai | null }[], today: string): Record<BaiStep, BaiKpiRow> {
  const out = {} as Record<BaiStep, BaiKpiRow>;
  const round = (n: number) => Math.round(n * 10) / 10;
  for (const step of ["collect", "compile", "verify"] as const) {
    const times = sites.map((s) => baiTimeliness(s.bai, today)[step]).filter((t): t is BaiStepTime => !!t);
    const count = (state: BaiTimelinessState) => times.filter((t) => t.state === state).length;
    const onTime = count("on_time");
    const late = count("late") + count("late_open");
    const finished = times.filter((t) => t.state === "on_time" || t.state === "late");
    out[step] = {
      total: times.length,
      onTime,
      late,
      waiting: count("waiting"),
      pct: onTime + late ? round((onTime / (onTime + late)) * 100) : null,
      averageDays: finished.length ? round(finished.reduce((a, t) => a + t.days, 0) / finished.length) : null,
    };
  }
  return out;
}

export type DropProblem = "locked" | "reason";

/** A project is dropped, with a reason, only before its BAST is approved: after that billing has started. */
export function dropProblems(p: { status: ProjectStatus; bastOn: string | null }, reason: string): DropProblem[] {
  if (p.bastOn || !IN_DELIVERY.includes(p.status)) return ["locked"];
  return reason.trim() ? [] : ["reason"];
}
