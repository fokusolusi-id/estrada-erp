import { amount, header, text, type Cell } from "./cells";

export interface ImportedCompany {
  code: string;
  name: string;
  npwp: string | null;
  nib: string | null;
  address: string | null;
  /** Kedudukan */
  domicile: string | null;
  phone: string | null;
  email: string | null;
  director: string | null;
  commissioner: string | null;
  /** Modal Dasar, a decimal string. */
  authorisedCapital: string | null;
}

const COLS = ["ID_Perusahaan", "Nama Perusahaan", "NPWP", "No NIB", "Alamat", "Kedudukan", "Phone", "Email", "Direktur", "Komisaris", "Modal Dasar"] as const;

/** Sheet "M Perusahaan": one company per ID_Perusahaan (the app's entity code). */
export function parseCompanies(rows: Cell[][]): ImportedCompany[] {
  const h = header(rows, COLS);
  const byCode = new Map<string, ImportedCompany>();

  for (const r of rows.slice(h.row + 1)) {
    const get = (c: (typeof COLS)[number]) => text(r[h.col(c)]).replace(/\s+/g, " ").trim();
    const optional = (c: (typeof COLS)[number]) => get(c).replace(/^-$/, "") || null;
    const code = get("ID_Perusahaan").toUpperCase();
    if (!code) continue;
    if (byCode.has(code)) throw new Error(`Perusahaan ${code}: ID dipakai dua baris`);
    const name = get("Nama Perusahaan");
    if (!name) throw new Error(`Perusahaan ${code}: Nama Perusahaan wajib diisi`);

    byCode.set(code, {
      code,
      name,
      npwp: optional("NPWP"),
      nib: optional("No NIB"),
      address: optional("Alamat"),
      domicile: optional("Kedudukan"),
      phone: optional("Phone"),
      email: optional("Email"),
      director: optional("Direktur"),
      commissioner: optional("Komisaris"),
      authorisedCapital: amount(r[h.col("Modal Dasar")])?.toFixed(2) ?? null,
    });
  }
  return [...byCode.values()];
}
