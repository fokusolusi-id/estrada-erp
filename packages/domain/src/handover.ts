import type { OrgTree } from "./org";
import type { Actor } from "./policy";
import type { ProjectTeam } from "./project";
import type { Role } from "./roles";

/** The official receiver of a delivered project, and the operator that receives what follows from it. */
export const RECEIVER_UNIT = "MSO";
export const OPERATOR_UNIT = "ISO";
/** Staff Operational EOS, who checks operational readiness. */
export const EOS_UNIT = "MSO-EOS";

/** Kamus Field D row 3: the cycle of the handover gates. */
export const HANDOVER_STATUSES = ["Disusun", "Diajukan", "Dikembalikan", "Diterima_MSO", "Diterima_ISO", "Selesai"] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];
export const HANDOVER_STATUS_LABEL: Record<HandoverStatus, string> = {
  Disusun: "Disusun",
  Diajukan: "Diajukan",
  Dikembalikan: "Dikembalikan",
  Diterima_MSO: "Diterima MSO",
  Diterima_ISO: "Diterima ISO",
  Selesai: "Selesai",
};

export interface Artefact {
  no: number;
  name: string;
  /** Who makes it, and who receives it. */
  from: string;
  to: string;
  /** Mandatory, mandatory only when the project has an application, or recommended. */
  need: "wajib" | "aplikasi" | "dianjurkan";
}

/** Serah Terima section C: what moves, and to whom. */
export const ARTEFACTS: readonly Artefact[] = [
  { no: 1, name: "Daftar lokasi layanan beserta alamat dan PIC pelanggan", from: "PMO / Project Admin", to: "MSO / Staff Operational EOS", need: "wajib" },
  { no: 2, name: "Daftar perangkat terpasang per lokasi dengan nomor seri", from: "SCM / Warehouse dan PMO / Delivery Control", to: "ISO / Staff Infra & Network", need: "wajib" },
  { no: 3, name: "Daftar perangkat cadangan dan lokasi simpannya", from: "SCM / Staff Warehouse & Logistics", to: "MSO / Staff Operational EOS", need: "wajib" },
  { no: 4, name: "Dokumen garansi dan matriks kontak vendor atau principal", from: "SCM / Staff Vendor Management", to: "ISO / Staff Problem Handling", need: "wajib" },
  { no: 5, name: "Daftar dan bukti lisensi beserta masa berlakunya", from: "PMO / Staff Delivery Control", to: "ISO / Staff Application Service", need: "wajib" },
  { no: 6, name: "Dokumen as-built: topologi jaringan dan konfigurasi perangkat", from: "PMO / Staff Delivery Control", to: "ISO / Staff Infra & Network", need: "wajib" },
  { no: 7, name: "Kredensial dan hak akses perangkat, aplikasi, serta jalur remote", from: "PMO / Staff Delivery Control", to: "ISO / Staff Infra & Network dan Application Service", need: "wajib" },
  { no: 8, name: "Akses repository, CI/CD, dan lingkungan staging serta produksi", from: "PMO / Staff Delivery Control", to: "ISO / Staff Application Service", need: "aplikasi" },
  { no: 9, name: "Baseline pemantauan dan ambang peringatan", from: "PMO / Staff Delivery Control", to: "ISO / Staff Infra & Network", need: "wajib" },
  { no: 10, name: "Run book dan SOP operasional layanan", from: "PMO / Staff Delivery Control", to: "ISO / Head ISO", need: "wajib" },
  { no: 11, name: "Hasil uji dan UAT proyek, beserta daftar masalah terbuka saat go-live", from: "PMO / Delivery Control dan Project Admin", to: "ISO / Staff Application Service", need: "wajib" },
  { no: 12, name: "Jadwal preventive maintenance dan ketentuan persetujuan pelanggan", from: "PMO / Staff Project Manager", to: "ISO / Head ISO", need: "wajib" },
  { no: 13, name: "Klausul SLA, matriks severity, dan jendela layanan", from: "PMO / Staff Project Manager", to: "MSO / Head MSO dan ISO / Service Desk", need: "wajib" },
  { no: 14, name: "Manual pengguna dan materi pelatihan pelanggan", from: "PMO / Staff Project Admin", to: "MSO / Leader Customer Experiences", need: "dianjurkan" },
  { no: 15, name: "Daftar masa garansi per perangkat dan tanggal berakhirnya", from: "SCM / Vendor Management dan PMO / Delivery Control", to: "MSO / Head MSO dan ISO / Problem Handling", need: "wajib" },
];

/** Serah Terima section A: Head MSO's five written acceptance criteria. */
export const MSO_CRITERIA = [
  { key: "lingkupKontrak", label: "Ruang lingkup kontrak", checks: "Layanan yang diserahkan sama dengan kontrak: jenis layanan, jumlah lokasi, jumlah perangkat, masa layanan" },
  { key: "ambangSla", label: "Ambang batas SLA", checks: "Tingkat layanan yang dijanjikan ke pelanggan beserta denda bila tidak tercapai" },
  { key: "sparePart", label: "Ketersediaan spare parts", checks: "Perangkat cadangan tersedia dan cukup untuk memenuhi target waktu pulih" },
  { key: "topologiKonfigurasi", label: "Topologi dan konfigurasi teknis", checks: "Gambar topologi akhir dan konfigurasi sebagaimana terpasang (as-built)" },
  { key: "administrasi", label: "Kelengkapan administrasi", checks: "BAI per lokasi, BAST, evidence, berita acara dan dokumen penyelesaian lengkap" },
] as const;
export type CriterionKey = (typeof MSO_CRITERIA)[number]["key"];

/** Serah Terima section B: Staff Operational EOS's four checklist items. */
export const EOS_CHECKLIST = [
  { key: "perangkatCadangan", label: "Ketersediaan perangkat cadangan", checks: "Unit pengganti siap pakai di dekat lokasi layanan" },
  { key: "lisensi", label: "Lisensi", checks: "Lisensi perangkat lunak dan langganan dukungan principal masih berlaku dan terdaftar atas nama yang benar" },
  { key: "topologiJaringan", label: "Topologi jaringan", checks: "Gambar jaringan sebagaimana terpasang, bukan sebagaimana dirancang" },
  { key: "aksesRemote", label: "Akses remote", checks: "Kredensial dan jalur masuk ke perangkat serta aplikasi, beserta hak yang sesuai" },
] as const;
export type ChecklistKey = (typeof EOS_CHECKLIST)[number]["key"];

/** Mandatory artefacts not yet in the package, by number. `filled` are the numbers that have a reference. */
export function missingArtefacts(filled: Iterable<number>, hasApplication: boolean): number[] {
  const have = new Set(filled);
  return ARTEFACTS.filter((a) => (a.need === "wajib" || (a.need === "aplikasi" && hasApplication)) && !have.has(a.no)).map((a) => a.no);
}

export interface HandoverState {
  status: HandoverStatus;
  /** Whether the project delivered an application: makes artefact 8 mandatory. */
  hasApplication: boolean;
  /** Numbers of the artefacts that have a reference. */
  artefacts: readonly number[];
  /** The approved BAST date; the handover starts from it. */
  bastOn: string | null;
  submittedBy: string | null;
  criteria: Readonly<Record<string, boolean>>;
  checklist: Readonly<Record<string, boolean>>;
}

export type HandoverAction = "artefact" | "submit" | "accept_mso" | "return" | "checklist" | "accept_iso";
export type HandoverProblem = "wrong_status" | "bast" | "artefacts" | "criteria" | "checklist" | "note" | "HANDOVER_SELF_ACCEPTANCE";

const FROM: Record<HandoverAction, readonly HandoverStatus[]> = {
  artefact: ["Disusun", "Dikembalikan"],
  submit: ["Disusun", "Dikembalikan"],
  accept_mso: ["Diajukan"],
  return: ["Diajukan"],
  checklist: ["Diajukan", "Diterima_MSO"],
  accept_iso: ["Diterima_MSO"],
};
const NEXT: Partial<Record<HandoverAction, HandoverStatus>> = { submit: "Diajukan", accept_mso: "Diterima_MSO", return: "Dikembalikan", accept_iso: "Diterima_ISO" };

/**
 * The handover gates in order: PMO submits a complete package after BAST, Head MSO accepts it against the five
 * criteria or returns it with a note, Staff Operational EOS checks operational readiness, Head ISO accepts what
 * follows from it. `next` is the package's status when there are no problems.
 */
export function handoverProblems(action: HandoverAction, h: HandoverState, actorId: string, note = ""): { problems: HandoverProblem[]; next: HandoverStatus } {
  const next = NEXT[action] ?? h.status;
  if (!FROM[action].includes(h.status)) return { problems: ["wrong_status"], next };
  const problems: HandoverProblem[] = [];
  switch (action) {
    case "submit":
      if (!h.bastOn) problems.push("bast");
      else if (missingArtefacts(h.artefacts, h.hasApplication).length) problems.push("artefacts");
      break;
    case "accept_mso":
      if (actorId === h.submittedBy) problems.push("HANDOVER_SELF_ACCEPTANCE");
      else if (!MSO_CRITERIA.every((c) => h.criteria[c.key])) problems.push("criteria");
      break;
    case "return":
      if (!note.trim()) problems.push("note");
      break;
    case "accept_iso":
      if (!EOS_CHECKLIST.every((c) => h.checklist[c.key])) problems.push("checklist");
      break;
  }
  return { problems, next };
}

const HEADS: readonly Role[] = ["default_owner", "division_owner"];
/** The head of a department: a Default Owner or Division Owner seated at that unit itself. */
const headOf = (actor: Actor, unit: string) => HEADS.includes(actor.role) && actor.orgUnit === unit;

/**
 * Matriks peran rows 25-28: the project team fills the package and the Project Manager submits it; Head MSO accepts
 * or returns; Staff Operational EOS fills the checklist; Head ISO accepts the technical handover.
 */
export function canHandover(actor: Actor, action: HandoverAction, project: { entity: string; team: ProjectTeam }, org: OrgTree): boolean {
  if (!(actor.entities.includes("*") || actor.entities.includes(project.entity))) return false;
  switch (action) {
    case "artefact":
      return [project.team.pm, project.team.deliveryControl, project.team.projectAdmin].includes(actor.userId);
    case "submit":
      return project.team.pm === actor.userId;
    case "accept_mso":
    case "return":
      return headOf(actor, RECEIVER_UNIT);
    case "checklist":
      return org.isWithin(actor.orgUnit, EOS_UNIT);
    case "accept_iso":
      return headOf(actor, OPERATOR_UNIT);
  }
}
