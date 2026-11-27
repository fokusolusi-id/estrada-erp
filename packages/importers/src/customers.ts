import { cleanNpwp } from "@estrada/domain";
import { header, text, type Cell } from "./cells";

export interface ImportedCustomer {
  id: string;
  nickname: string;
  segment: string;
  legalName: string;
  npwp: string | null;
  email: string | null;
  address: string | null;
  phone: string | null;
  picName: string | null;
  picPhone: string | null;
  picTitle: string | null;
  picEmail: string | null;
}

const COLS = ["ID", "Nickname Customer", "Segmen", "Nama Customer", "NPWP", "Email", "Alamat", "Telpon", "Nama PIC", "Telp PIC", "Jabatan PIC", "Email PIC"] as const;

/** Sheet "M Customer": one customer per ID. Duplicate NPWPs are judged by the loader (splitDuplicateNpwp). */
export function parseCustomers(rows: Cell[][]): ImportedCustomer[] {
  const h = header(rows, COLS);
  const byId = new Map<string, ImportedCustomer>();

  for (const r of rows.slice(h.row + 1)) {
    const get = (c: (typeof COLS)[number]) => text(r[h.col(c)]).replace(/\s+/g, " ").trim();
    const optional = (c: (typeof COLS)[number]) => get(c).replace(/^-$/, "") || null;
    const id = get("ID");
    if (!id) continue;
    if (byId.has(id)) throw new Error(`Customer ${id}: ID dipakai dua baris`);

    const legalName = get("Nama Customer");
    const segment = get("Segmen");
    if (!legalName || !segment) throw new Error(`Customer ${id}: Nama Customer dan Segmen wajib diisi`);

    byId.set(id, {
      id,
      nickname: get("Nickname Customer") || legalName,
      segment,
      legalName,
      npwp: cleanNpwp(get("NPWP")),
      email: optional("Email"),
      address: optional("Alamat"),
      phone: optional("Telpon"),
      picName: optional("Nama PIC"),
      picPhone: optional("Telp PIC"),
      picTitle: optional("Jabatan PIC"),
      picEmail: optional("Email PIC"),
    });
  }
  return [...byId.values()];
}
