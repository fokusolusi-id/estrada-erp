/** The compliance checklist (plan E8; sheet 06_Compliance, screen SCR-AUD-03). The rows are the sheet's; status and evidence are recorded in the app. */

export const COMPLIANCE_STATUSES = ["to_implement", "in_progress", "implemented", "future"] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];
export const COMPLIANCE_STATUS_LABEL: Record<ComplianceStatus, string> = { to_implement: "Belum diterapkan", in_progress: "Sedang diterapkan", implemented: "Sudah diterapkan", future: "Rencana mendatang" };

export interface ComplianceItem {
  code: string;
  regulation: string;
  clause: string;
  area: string;
  implementation: string;
  /** What counts as proof. */
  evidence: string;
  initial: ComplianceStatus;
}

export const COMPLIANCE_ITEMS: readonly ComplianceItem[] = [
  { code: "ppn", regulation: "UU 7/2021 + UU 8/1983 (PPN)", clause: "PPN 11% (DPP x 11%)", area: "Finance (Penagihan)", implementation: "Auto-calc PPN per invoice; flag Wapu (PPN tidak dipungut perusahaan)", evidence: "Invoice + e-Faktur", initial: "to_implement" },
  { code: "pph", regulation: "UU PPh + PMK", clause: "PPh 23, PPh 4(2), PPh 22 per jenis", area: "Finance (Penagihan)", implementation: "Auto-calc PPh per jenis transaksi & customer type", evidence: "Bukti potong PPh", initial: "to_implement" },
  { code: "kup", regulation: "UU KUP", clause: "Pembukuan retensi 10 tahun", area: "All Reporting + Audit Log", implementation: "Snapshot immutable 10 tahun; retention policy storage", evidence: "Snapshot files + audit log", initial: "to_implement" },
  { code: "psak72", regulation: "PSAK 72", clause: "Revenue from Contracts with Customers", area: "Finance (Penagihan + PnL)", implementation: "Pengakuan revenue berbasis performance obligation (RFS/BAST per termin)", evidence: "Jurnal + working paper", initial: "to_implement" },
  { code: "psak71", regulation: "PSAK 71", clause: "Instrumen Keuangan (ECL)", area: "Finance (AR)", implementation: "AR aging + provisi bad debt (CKPN) sesuai ECL model", evidence: "AR aging report + perhitungan ECL", initial: "to_implement" },
  { code: "pojk_bg", regulation: "POJK Bank Garansi", clause: "Bank Garansi & Akad KMK", area: "Obligo Bank", implementation: "Master fasilitas + plafon + outstanding tercatat; rekonsiliasi mingguan dengan statement bank", evidence: "Akad fisik + rekap obligo", initial: "to_implement" },
  { code: "pdp", regulation: "UU ITE + UU PDP", clause: "Perlindungan Data Pribadi", area: "Master Data + Security", implementation: "RBAC; encryption-at-rest untuk data sensitif (NPWP, gaji); audit akses", evidence: "Privacy policy + DPIA + log akses", initial: "to_implement" },
  { code: "itgc", regulation: "SOX-style ITGC (best practice)", clause: "IT General Controls", area: "All", implementation: "Access mgmt, change mgmt, ops, backup, BCP", evidence: "ITGC test workpapers", initial: "to_implement" },
  { code: "sod", regulation: "SoD Principles (COSO)", clause: "Segregation of Duties", area: "All transaksi finansial", implementation: "RBAC enforce; 05_SoD_Matrix sebagai blueprint", evidence: "Akses review berkala", initial: "to_implement" },
  { code: "procurement", regulation: "UU Cipta Kerja – Procurement", clause: "Tata kelola pengadaan", area: "SCM", implementation: "PO threshold-based approval; mitra wajib NPWP; 3-way match", evidence: "PO + BAST + Invoice mitra", initial: "to_implement" },
  { code: "lkpp", regulation: "Kontrak K/L (LKPP)", clause: "Pengadaan Pemerintah", area: "Projek + Obligo (BG)", implementation: "BG Penawaran/Pelaksanaan/Pemeliharaan/UM; kontrak retention", evidence: "BG fisik + kontrak", initial: "to_implement" },
  { code: "ketenagakerjaan", regulation: "UU 13/2003 Ketenagakerjaan", clause: "Data karyawan & gaji", area: "M Karyawan", implementation: "Sync dari HRMS estrada.co.id; encrypted; akses HRD only", evidence: "Data masking + audit", initial: "to_implement" },
  { code: "iso27001", regulation: "ISO 27001 (target)", clause: "ISMS", area: "All", implementation: "Information security mgmt; control matrix", evidence: "Internal audit + certification", initial: "future" },
  { code: "iso9001", regulation: "ISO 9001 (target)", clause: "Quality Mgmt", area: "Projek + Implementasi", implementation: "Standar mutu proses; non-conformance tracking", evidence: "QMS docs", initial: "future" },
  { code: "coa", regulation: "Standar Akuntansi Internal", clause: "Chart of Account (COA) Estrada", area: "M COA & Cost Center", implementation: "23 COA Project / Non-Project; mapping cost center per divisi", evidence: "Manual COA + RKA", initial: "to_implement" },
  { code: "authority_matrix", regulation: "Internal Policy: Approval Authority Matrix", clause: "Threshold-based approval", area: "All transaksi", implementation: "Matrix authority terdokumentasi (PO, RKA, Invoice, BG)", evidence: "Policy doc + role mapping", initial: "to_implement" },
  { code: "whistleblowing", regulation: "Internal Policy: Whistleblowing", clause: "Pelaporan pelanggaran", area: "Audit/Controller", implementation: "Channel pelaporan + perlindungan whistleblower", evidence: "Whistleblowing policy", initial: "future" },
];

export interface ComplianceRecord {
  code: string;
  status: ComplianceStatus;
  evidenceUrl: string | null;
  note: string | null;
}

/** Each row with what was recorded for it, else the sheet's own status. */
export const complianceList = (records: readonly ComplianceRecord[]) =>
  COMPLIANCE_ITEMS.map((item) => {
    const r = records.find((x) => x.code === item.code);
    return { ...item, status: r?.status ?? item.initial, evidenceUrl: r?.evidenceUrl ?? null, note: r?.note ?? null };
  });

export const complianceSummary = (list: readonly { status: ComplianceStatus }[]) =>
  Object.fromEntries(COMPLIANCE_STATUSES.map((s) => [s, list.filter((i) => i.status === s).length])) as Record<ComplianceStatus, number>;

/** Evidence is a web link, so nothing else can be put behind the row's anchor. */
export function complianceProblem(v: { code: string; evidenceUrl: string }): "unknown" | "link" | null {
  if (!COMPLIANCE_ITEMS.some((i) => i.code === v.code)) return "unknown";
  return v.evidenceUrl && !/^https?:\/\/[^\s]+$/i.test(v.evidenceUrl) ? "link" : null;
}
