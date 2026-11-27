import { PARTNER_CATEGORIES, cleanNpwp, type PartnerCategory } from "@estrada/domain";
import { header, text, type Cell } from "./cells";

export interface ImportedPartner {
  id: string;
  name: string;
  category: PartnerCategory;
  npwp: string | null;
  city: string | null;
  email: string | null;
  address: string | null;
  phone: string | null;
  picName: string | null;
  picPhone: string | null;
  picTitle: string | null;
  picEmail: string | null;
}

export interface ImportedPartnerProduct {
  partnerId: string;
  partnerName: string;
  /** Kategori: Hardware, … */
  category: string;
  /** Jenis */
  type: string;
  brand: string;
}

/** Invisible formatting characters (direction marks, zero width) that pasted numbers carry. */
const HIDDEN = /\p{Cf}/gu;
const clean = (c: Cell) => text(c).replace(HIDDEN, "").replace(/\s+/g, " ").trim();

const COLS = ["ID", "Nama Mitra", "Kategori", "NPWP", "Kota", "Email", "Alamat", "Telpon", "Nama PIC", "Telp PIC", "Jabatan PIC", "Email PIC"] as const;

/** Sheet "Master Mitra": one partner per ID. */
export function parsePartners(rows: Cell[][]): ImportedPartner[] {
  const h = header(rows, COLS);
  const byId = new Map<string, ImportedPartner>();

  for (const r of rows.slice(h.row + 1)) {
    const get = (c: (typeof COLS)[number]) => clean(r[h.col(c)]);
    const optional = (c: (typeof COLS)[number]) => get(c).replace(/^-$/, "") || null;
    const id = get("ID");
    if (!id) continue;
    if (byId.has(id)) throw new Error(`Mitra ${id}: ID dipakai dua baris`);

    const name = get("Nama Mitra");
    if (!name) throw new Error(`Mitra ${id}: Nama Mitra wajib diisi`);
    const category = PARTNER_CATEGORIES.find((c) => c.toLowerCase() === get("Kategori").toLowerCase());
    if (!category) throw new Error(`Mitra ${id}: kategori "${get("Kategori")}" harus ${PARTNER_CATEGORIES.join(" atau ")}`);

    byId.set(id, {
      id,
      name,
      category,
      npwp: cleanNpwp(get("NPWP")),
      city: optional("Kota"),
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

const PRODUCT_COLS = ["ID", "Nama Mitra", "Kategori", "Jenis", "Brand"] as const;

/** Sheet "Master Product Mitra". Its ID column repeats the partner's ID; the loader numbers the products. */
export function parsePartnerProducts(rows: Cell[][]): ImportedPartnerProduct[] {
  const h = header(rows, PRODUCT_COLS);
  const seen = new Map<string, ImportedPartnerProduct>();

  for (const r of rows.slice(h.row + 1)) {
    const get = (c: (typeof PRODUCT_COLS)[number]) => clean(r[h.col(c)]);
    const partnerId = get("ID");
    if (!partnerId) continue;
    const p = { partnerId, partnerName: get("Nama Mitra"), category: get("Kategori"), type: get("Jenis"), brand: get("Brand") };
    if (!p.category || !p.type || !p.brand) throw new Error(`Produk Mitra ${partnerId}: Kategori, Jenis dan Brand wajib diisi`);
    seen.set(JSON.stringify([partnerId, p.category, p.type, p.brand]).toLowerCase(), p);
  }
  return [...seen.values()];
}
