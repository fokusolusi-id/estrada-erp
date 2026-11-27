import "server-only";
import { and, count, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { coaParentProblem, remapProblem, type Category, type CoaParentProblem, type RemapProblem } from "@estrada/domain";

export type Master = "coa" | "entity";
export type MasterChange =
  | { master: "coa"; action: "create" | "update"; subjectId: string; payload: CoaValues }
  | { master: "coa"; action: "confirm"; subjectId: string; payload: Record<string, never> }
  | { master: "coa"; action: "remap"; subjectId: string; payload: { target: string } }
  | { master: "entity"; action: "create" | "update"; subjectId: string; payload: EntityValues };

export interface CoaValues {
  name: string;
  category: Category;
  center: "revenue" | "cost";
  defaultOwnerUnit: string | null;
  parentCode: string | null;
  active: boolean;
  guidance: string | null;
}
export interface EntityValues {
  name: string;
  costType: "direct" | "indirect";
  active: boolean;
  npwp: string | null;
  nib: string | null;
  address: string | null;
  domicile: string | null;
  phone: string | null;
  email: string | null;
  director: string | null;
  commissioner: string | null;
  authorisedCapital: string | null;
}

export interface ChangeProblem {
  message: string;
  errors?: Record<string, string[]>;
}

type Conn = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const PARENT_MESSAGE: Record<CoaParentProblem, string> = {
  self: "Kode tidak bisa menjadi induknya sendiri.",
  missing: "Kode induk tidak ditemukan.",
  category_mismatch: "Induk harus berkategori sama, supaya subtotal tetap di baris P&L yang sama.",
  cycle: "Induk ini berada di bawah kode tersebut.",
};

const REMAP_MESSAGE: Record<RemapProblem, string> = {
  source_not_provisional: "Hanya kode sementara yang bisa dipindahkan.",
  target_missing: "Kode tujuan tidak ditemukan.",
  same_code: "Kode tujuan sama dengan kode asal.",
  target_inactive: "Kode tujuan tidak aktif.",
  target_provisional: "Kode tujuan juga masih sementara.",
  target_not_postable: "Kode tujuan adalah akun induk; pilih akun turunannya.",
  category_mismatch: "Kategori kode tujuan berbeda; total kategori akan berubah.",
  locked_lines: "Ada baris di versi yang sudah dikunci; versi terkunci tidak diubah.",
};

const coaRow = async (conn: Conn, code: string) => (await conn.select().from(schema.coaAccount).where(eq(schema.coaAccount.code, code)))[0];
const entityRow = async (conn: Conn, code: string) => (await conn.select().from(schema.companyEntity).where(eq(schema.companyEntity.code, code)))[0];

/**
 * Whether a change can be made to the master as it stands, and the record as it is now. Asked when the change is
 * requested and again when it is applied, since the master may have moved on in between.
 */
export async function checkChange(conn: Conn, c: MasterChange): Promise<{ problem: ChangeProblem } | { before: Record<string, unknown> | null }> {
  const no = (message: string, errors?: Record<string, string[]>) => ({ problem: { message, ...(errors ? { errors } : {}) } });
  const code = c.subjectId;

  if (c.master === "entity") {
    const existing = await entityRow(conn, code);
    if (c.action === "create" && existing) return no("Kode entitas sudah ada.");
    if (c.action === "update" && !existing) return no("Entitas tidak ditemukan.");
    if (!existing) return { before: null };
    return { before: Object.fromEntries(Object.entries(existing).filter(([k]) => k !== "code")) };
  }

  const existing = await coaRow(conn, code);
  if (c.action === "confirm") return existing?.provisional ? { before: existing } : no("Kode ini bukan kode sementara.");
  if (c.action === "remap") {
    if (!existing) return no("Kode asal tidak ditemukan.");
    const target = await coaRow(conn, c.payload.target);
    const [locked] = await conn
      .select({ n: count() })
      .from(schema.budgetLine)
      .innerJoin(schema.budgetVersion, eq(schema.budgetVersion.id, schema.budgetLine.versionId))
      .where(and(eq(schema.budgetLine.coaCode, code), eq(schema.budgetVersion.status, "locked")));
    const problem = remapProblem(existing, target, locked?.n ?? 0);
    return problem ? no(REMAP_MESSAGE[problem]) : { before: existing };
  }

  if (c.action === "create" && existing) return no(`Kode ${code} sudah ada.`);
  if (c.action === "update" && !existing) return no(`Kode ${code} tidak ditemukan.`);
  const { category, parentCode } = c.payload as CoaValues;
  const recategorised = !!existing && existing.category !== category;
  if (recategorised) {
    const [used] = await conn.select({ n: count() }).from(schema.budgetLine).where(eq(schema.budgetLine.coaCode, code));
    if (used?.n) return no(`Kategori tidak bisa diubah: kode ini dipakai ${used.n} baris RKA.`);
  }
  const tree = await conn.select({ code: schema.coaAccount.code, category: schema.coaAccount.category, parentCode: schema.coaAccount.parentCode }).from(schema.coaAccount);
  const parentProblem = coaParentProblem(code, parentCode, tree, category);
  if (parentProblem) return no("Periksa isian.", { parentCode: [PARENT_MESSAGE[parentProblem]] });
  if (recategorised && tree.some((a) => a.parentCode === code)) return no("Kategori tidak bisa diubah selama kode ini masih punya anak.");
  return { before: existing ?? null };
}

/** Writes an approved change. Run inside the transaction that checked it. Nothing is hard-deleted. */
export async function writeChange(tx: Conn, c: MasterChange): Promise<Record<string, unknown>> {
  const code = c.subjectId;
  const updatedAt = new Date();
  if (c.master === "entity") {
    if (c.action === "create") await tx.insert(schema.companyEntity).values({ code, ...c.payload });
    else await tx.update(schema.companyEntity).set(c.payload).where(eq(schema.companyEntity.code, code));
    return { ...c.payload };
  }
  if (c.action === "confirm") {
    await tx.update(schema.coaAccount).set({ provisional: false, guidance: null, updatedAt }).where(eq(schema.coaAccount.code, code));
    return { provisional: false };
  }
  if (c.action === "remap") {
    const rows = await tx.update(schema.budgetLine).set({ coaCode: c.payload.target, updatedAt }).where(eq(schema.budgetLine.coaCode, code)).returning({ id: schema.budgetLine.id });
    // The emptied code is retired, not deleted (FC12 rule 1).
    await tx.update(schema.coaAccount).set({ provisional: false, active: false, updatedAt }).where(eq(schema.coaAccount.code, code));
    return { target: c.payload.target, lines: rows.length, active: false };
  }
  const payload = c.payload as CoaValues;
  if (c.action === "create") await tx.insert(schema.coaAccount).values({ code, ...payload });
  else await tx.update(schema.coaAccount).set({ ...payload, updatedAt }).where(eq(schema.coaAccount.code, code));
  return { ...payload };
}
