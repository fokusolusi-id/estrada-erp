/**
 * Event code, severity and retention of every action the app writes to audit_log (sheet 04_Audit_Log_Spec).
 * Stored actions keep the app's names; the catalogue reads them. Codes the sheet lacks are marked `inSheet: false`.
 */
export type AuditSeverity = "Info" | "Low" | "Medium" | "High" | "Critical";

export interface AuditEventType {
  code: string;
  module: string;
  trigger: string;
  severity: AuditSeverity;
  retentionYears: number;
  inSheet: boolean;
  /** App actions: a full name, or a prefix ending in "*". No two entries overlap. */
  actions: readonly string[];
}

const sheet = (code: string, module: string, trigger: string, severity: AuditSeverity, retentionYears: number, actions: string[]): AuditEventType => ({ code, module, trigger, severity, retentionYears, inSheet: true, actions });
const app = (code: string, module: string, trigger: string, severity: AuditSeverity, actions: string[]): AuditEventType => ({ code, module, trigger, severity, retentionYears: 10, inSheet: false, actions });

export const AUDIT_EVENTS: readonly AuditEventType[] = [
  sheet("AUTH.LOGIN", "Security", "Masuk, termasuk yang gagal", "Info", 1, ["auth.login", "auth.login_failed"]),
  sheet("AUTH.LOGOUT", "Security", "Keluar", "Info", 1, ["auth.logout"]),
  sheet("SEC.PERMCHANGE", "Security", "Ubah pengguna, peran atau posisi", "Critical", 10, ["user.*", "position.create", "position.update", "position.assign_acting", "position.clear_acting"]),
  app("SEC.ACTAS", "Security", "Berpindah posisi atau bertindak sebagai", "Medium", ["position.switch", "admin.act_as"]),
  sheet("RKA.SUBMIT", "RKA", "Pengajuan RKA", "Medium", 10, ["line.submit"]),
  sheet("RKA.APPROVE", "RKA", "Persetujuan anggaran", "High", 10, ["line.consolidate", "line.approve", "line.finalize", "line.lock"]),
  sheet("RKA.REALIZE", "RKA", "Catat realisasi", "Medium", 10, ["line.actual", "actual.adjust"]),
  app("RKA.EDIT", "RKA", "Isi, ubah, kembalikan atau hapus baris", "Medium", ["line.create", "line.update", "line.delete", "line.comment", "line.shared", "variance.note", "line.return", "line.send_back", "line.clarify", "version.headcount"]),
  app("RKA.CYCLE", "RKA", "Siklus dan versi RKA", "High", ["cycle.*"]),
  sheet("SP.STATUSCHANGE", "Sales Pipeline", "Tambah, ubah atau hapus deal", "Medium", 10, ["pipeline.create", "pipeline.update", "pipeline.delete"]),
  app("SCM.PROCUREMENT", "Pengadaan", "PR, PO dan penerimaan", "High", ["procurement.*"]),
  app("FIN.TELKOM", "Projek", "Tahapan penagihan Telkom", "Medium", ["telkom.*"]),
  app("KPI.TARGET", "KPI", "Target KPI", "Critical", ["kpi.*"]),
  app("BOD.VIEW", "Dashboard", "Dashboard BOD dan highlight", "Info", ["bod.*"]),
  app("RPT.REPORT", "Reporting", "Laporan berkala", "Critical", ["report.*"]),
  app("EW.ALERT", "Early Warning", "Peringatan dini", "Critical", ["ew.*"]),
  app("RISK.REGISTER", "Risk", "Register risiko", "High", ["risk.*"]),
  app("SP.SPH", "Sales Pipeline", "SPH", "High", ["sph.*"]),
  app("SP.RECOVERY", "Sales Pipeline", "Rencana pemulihan", "Medium", ["pipeline.recovery_plan"]),
  sheet("PRJ.CREATE", "Projek", "Buka proyek", "Medium", 10, ["project.open"]),
  sheet("PRJ.CONTRACT", "Projek", "Data kontrak", "High", 10, ["project.contract_sites", "project.contract_p8", "project.contract_record"]),
  sheet("PRJ.STATUSCHANGE", "Projek", "Ganti status proyek", "Medium", 10, ["project.status", "project.drop", "project.close"]),
  sheet("IMP.RFS", "Implementasi", "Tandai RFS", "High", 10, ["project.rfs_*"]),
  sheet("IMP.BAST", "Implementasi", "BAST", "High", 10, ["project.bast_*"]),
  sheet("IMP.MILESTONE", "Implementasi", "Perkembangan proyek", "Medium", 10, [
    "project.assign", "project.contract_pic", "project.baseline", "project.kickoff_gate", "project.telkom_scheme", "project.warranty", "project_planning.*", "project_site.*", "project_defect.*", "defect.*", "handover.*",
  ]),
  app("FIN.PAYREQ", "Finance", "Permintaan Pembayaran", "Medium", ["payment.create", "payment.update", "payment.document_add", "payment.document_remove", "payment.submit", "payment.return"]),
  app("FIN.PAYREQ.APPROVE", "Finance", "Persetujuan dan pembayaran", "Critical", ["payment.approve", "payment.verify", "payment.schedule", "payment.pay"]),
  sheet("FIN.INV.CREATE", "Finance", "Buat atau ubah invoice", "High", 10, ["invoice.create", "invoice.update", "invoice.return", "invoice.cancel"]),
  sheet("FIN.INV.APPROVE", "Finance", "Validasi, persetujuan dan penerbitan invoice", "Critical", 10, ["invoice.validate", "invoice.approve", "invoice.issue"]),
  sheet("FIN.PAY.RECEIVE", "Finance", "Catat atau batalkan penerimaan", "High", 10, ["receipt.record", "receipt.reverse"]),
  sheet("FIN.CLOSE", "Finance", "Tutup periode", "Critical", 10, ["period.close"]),
  app("FIN.PERIOD", "Finance", "Penutupan dan pembukaan periode", "High", ["period.start_closing", "period.cancel_closing", "period.reopen"]),
  app("SYS.COMPLIANCE", "Sistem", "Status kepatuhan", "Medium", ["compliance.*"]),
  app("FIN.BALANCE", "Finance", "Total neraca bulanan", "High", ["closing.*"]),
  app("FIN.TAX", "Finance", "Faktur, bukti potong dan PPh 21", "High", ["tax.*"]),
  app("FIN.CASH", "Finance", "Arus kas, pinjaman dan rekening", "High", ["cash.*", "loan.*", "bank_account.*"]),
  sheet("MD.CREATE", "Master Data", "Buat master", "High", 10, ["master.customer.create", "master.employee.create", "master.partner.create", "master.product.create", "coa.create", "entity.create", "unit.create"]),
  sheet("MD.UPDATE", "Master Data", "Ubah master", "High", 10, [
    "master.customer.update", "master.employee.update", "master.partner.update", "master.product.update", "master.costcenter.update",
    "master.request.submit", "master.request.cancel", "master.request.fail", "coa.update", "coa.confirm", "coa.remap", "entity.update", "entity.import", "unit.update", "unit.import_cost_center",
  ]),
  sheet("MD.DELETE", "Master Data", "Hapus atau nonaktifkan master", "Critical", 10, ["coa.only_file"]),
  sheet("MD.APPROVE", "Master Data", "Persetujuan perubahan master sensitif", "Critical", 10, ["master.request.approve", "master.request.reject"]),
  app("SYS.IMPORT", "Sistem", "Impor data", "High", ["import.*"]),
];

const OTHER: AuditEventType = app("SYS.OTHER", "Sistem", "Lainnya", "Medium", []);

export const AUDIT_MODULES: readonly string[] = [...new Set(AUDIT_EVENTS.map((e) => e.module))];

const fits = (pattern: string, action: string) => (pattern.endsWith("*") ? action.startsWith(pattern.slice(0, -1)) : pattern === action);

export const auditEvent = (action: string): AuditEventType => AUDIT_EVENTS.find((e) => e.actions.some((p) => fits(p, action))) ?? OTHER;

export const auditResult = (action: string): "success" | "fail" => (/(_failed|\.fail)$/.test(action) ? "fail" : "success");

/** The stored actions behind an event code or a module, as exact names and prefixes. */
export function auditMatcher({ code, module }: { code?: string; module?: string }): { exact: string[]; prefixes: string[] } {
  const patterns = AUDIT_EVENTS.filter((e) => (!code || e.code === code) && (!module || e.module === module)).flatMap((e) => e.actions);
  return { exact: patterns.filter((p) => !p.endsWith("*")), prefixes: patterns.filter((p) => p.endsWith("*")).map((p) => p.slice(0, -1)) };
}
