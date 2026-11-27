import { header, text, type Cell } from "./cells";

export interface ImportedEmployee {
  nip: string;
  name: string;
  email: string | null;
  entityCode: string;
  /** The department when the file names one, else the division. */
  unitCode: string | null;
  /** Posisi: Head, Leader, Staff, … */
  position: string;
  /** Jabatan */
  title: string;
  /** Kode: F0..F12 */
  functionCodes: string[];
  employmentStatus: string;
  active: boolean;
  joinedOn: string | null;
  managerNip: string | null;
  phone: string | null;
  notes: string | null;
}

/** Divisi as Data Karyawan writes it → org unit code. Units the file adds are in ORG_UNITS (seed-data). */
const DIVISIONS: Record<string, string> = {
  BOD: "DIR",
  "Commercial Business": "BCD",
  "Finance & Risk Management": "FRM",
  "Human Capital Management": "HCM",
  "Product Solution & Technology": "PST",
  "Project Delivery & Managed Services": "PDMS",
  "Tim Transisi": "TRANS",
  "DevOps Application": "DEVOPS",
  "Project Delivery Admin": "PDA",
  "Project Implementation & Technical Support": "PITS",
};

/** Department → org unit code; codes follow Struktur Organisasi (BCD-TEL, FRM-FIN). */
const DEPARTMENTS: Record<string, string> = {
  "Enterprise Business": "BCD-ENT",
  "Government Business": "BCD-GOV",
  "Telco Business": "BCD-TEL",
  "Territory Business": "BCD-TER",
  Finance: "FRM-FIN",
  "Integrated Service Operation": "ISO",
  "Managed Service Operation": "MSO",
  "Project Management Office": "PMO",
  "Supply Chain Management": "SCM",
  "Tim Pendamping": "TRANS-TP",
};

const MONTHS: Record<string, number> = {
  january: 1, februari: 2, february: 2, januari: 1, march: 3, maret: 3, april: 4, may: 5, mei: 5, june: 6, juni: 6,
  july: 7, juli: 7, august: 8, agustus: 8, september: 9, october: 10, oktober: 10, november: 11, december: 12, desember: 12,
};

const COLS = ["Employee NIP", "Employee Name", "Employee Email", "Kode", "Company Code", "Divisi", "Department", "Posisi", "Jabatan", "Employment Status", "Join Date", "Direct Manager NIP", "Phone", "Notes"] as const;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const blank = (s: string) => (s === "" || s === "-" ? null : s);

/** "01 April 2015" or "15 Agustus 2024" → 2015-04-01. */
function isoDate(nip: string, v: string): string | null {
  if (!blank(v)) return null;
  const m = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(squash(v));
  const month = m && MONTHS[m[2]!.toLowerCase()];
  const day = m ? Number(m[1]) : 0;
  if (!m || !month || day < 1 || day > 31) throw new Error(`Karyawan ${nip}: tanggal masuk "${v}" tidak terbaca`);
  return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Sheet "Data Karyawan": one employee per NIP. Nothing is guessed: rows the importer cannot place stop the load. */
export function parseEmployees(rows: Cell[][], ctx: { entities: readonly string[] }): ImportedEmployee[] {
  const h = header(rows, COLS);
  const byNip = new Map<string, ImportedEmployee>();
  const byEmail = new Map<string, string>();

  for (const r of rows.slice(h.row + 1)) {
    const get = (c: (typeof COLS)[number]) => squash(text(r[h.col(c)]));
    const nip = get("Employee NIP");
    if (!nip) continue;

    const entityCode = get("Company Code").toUpperCase();
    if (!ctx.entities.includes(entityCode)) throw new Error(`Karyawan ${nip}: perusahaan "${entityCode}" tidak dikenal`);

    const divisi = get("Divisi");
    const division = DIVISIONS[divisi];
    if (!division) throw new Error(`Karyawan ${nip}: divisi "${divisi}" tidak dikenal`);
    const dept = blank(get("Department"));
    const department = dept && dept !== divisi ? DEPARTMENTS[dept] : null;
    if (dept && dept !== divisi && !department) throw new Error(`Karyawan ${nip}: department "${dept}" tidak dikenal`);

    const status = get("Employment Status");
    const e: ImportedEmployee = {
      nip,
      name: get("Employee Name"),
      email: blank(get("Employee Email"))?.toLowerCase() ?? null,
      entityCode,
      unitCode: department ?? division,
      position: get("Posisi"),
      title: get("Jabatan"),
      functionCodes: get("Kode").split(",").map((s) => s.trim()).filter(Boolean),
      employmentStatus: status,
      active: status.toLowerCase() === "active",
      joinedOn: isoDate(nip, get("Join Date")),
      managerNip: blank(get("Direct Manager NIP")),
      phone: blank(get("Phone")),
      notes: blank(get("Notes")),
    };

    const seen = byNip.get(nip);
    if (seen) {
      if (JSON.stringify(seen) !== JSON.stringify(e)) throw new Error(`Karyawan ${nip}: NIP dipakai dua baris yang berbeda`);
      continue;
    }
    if (e.email) {
      const other = byEmail.get(e.email);
      if (other) throw new Error(`Karyawan ${nip}: email ${e.email} sudah dipakai ${other}`);
      byEmail.set(e.email, nip);
    }
    byNip.set(nip, e);
  }
  return [...byNip.values()];
}
