"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { PARTNER_CATEGORIES, can, cleanNpwp, customerIssues, nextMasterId, nextProductId, partnerIssues, splitDuplicateNpwp, type Permission } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string };
type Input = Record<string, string | boolean>;

const required = (label: string, max = 200) => z.string({ error: `${label} wajib diisi.` }).trim().min(1, `${label} wajib diisi.`).max(max);
/** A field that may be left blank, stored as null. */
const optional = z
  .string()
  .trim()
  .max(500)
  .default("")
  .transform((s) => s || null);

const Customer = z.object({
  nickname: required("Nama panggilan"),
  legalName: required("Nama customer"),
  segment: required("Segmen", 100),
  subSegment: optional,
  npwp: optional,
  address: optional,
  email: optional,
  phone: optional,
  picName: optional,
  picTitle: optional,
  picPhone: optional,
  picEmail: optional,
  paymentTermDays: z
    .string()
    .trim()
    .default("")
    .refine((s) => s === "" || (/^\d{1,3}$/.test(s) && Number(s) <= 365), "Term of payment harus 0–365 hari.")
    .transform((s) => (s === "" ? null : Number(s))),
  wapu: z.boolean().default(false),
  active: z.boolean(),
});

const Partner = z.object({
  name: required("Nama mitra"),
  category: z.enum(PARTNER_CATEGORIES, { error: "Pilih kategori mitra." }),
  npwp: optional,
  city: optional,
  address: optional,
  email: optional,
  phone: optional,
  picName: optional,
  picTitle: optional,
  picPhone: optional,
  picEmail: optional,
  active: z.boolean(),
});

const Product = z.object({
  partnerId: required("Mitra", 50),
  category: required("Kategori", 100),
  type: required("Jenis"),
  brand: required("Brand"),
  active: z.boolean(),
});

const Employee = z.object({
  nip: required("NIP", 40),
  name: required("Nama"),
  email: optional.transform((s) => s?.toLowerCase() ?? null),
  entityCode: required("PT", 40),
  unitCode: optional,
  position: required("Posisi", 100),
  title: required("Jabatan"),
  functionCodes: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)),
  employmentStatus: required("Status kerja", 50),
  joinedOn: optional.refine((s) => s === null || /^\d{4}-\d{2}-\d{2}$/.test(s), "Tanggal masuk ditulis YYYY-MM-DD."),
  managerNip: optional,
  phone: optional,
  notes: optional,
  active: z.boolean(),
});

/** The steward check and the form check, in that order. */
async function steward<T>(permission: Permission, refusal: string, shape: z.ZodType<T>, input: Input) {
  const user = await requireUser();
  if (!can(user.actor, permission, null, await loadOrg())) return { refused: { ok: false, message: refusal } };
  const parsed = shape.safeParse(input);
  if (!parsed.success) return { refused: { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." } };
  return { userId: user.id, data: parsed.data };
}

const NOT_FOUND: Result = { ok: false, message: "Data tidak ditemukan." };
const saved = (what: string, id: string, warnings: readonly { id: string; message: string }[]): Result => {
  const mine = warnings.filter((w) => w.id === id).map((w) => w.message);
  return { ok: true, message: `${what} ${id} disimpan.${mine.length ? ` Perlu ditinjau: ${mine.join("; ")}.` : ""}` };
};

/** Adds or changes a customer. Records are retired with Aktif, never deleted. */
export async function saveCustomer(id: string | null, input: Input): Promise<Result> {
  const s = await steward("customer.manage", "Master Customer diubah oleh Sales (BCD).", Customer, input);
  if ("refused" in s) return s.refused!;
  const all = await db.select().from(schema.customer);
  const before = all.find((c) => c.id === id);
  if (id && !before) return NOT_FOUND;
  const recordId = id ?? nextMasterId("Cust", all.map((c) => c.id));
  const values = { ...s.data, npwp: cleanNpwp(s.data.npwp ?? "") };
  const record = { id: recordId, ...values };
  const [rejected] = splitDuplicateNpwp([record], all.filter((c) => c.id !== recordId)).rejected;
  if (rejected) return { ok: false, message: `NPWP sudah dipakai ${rejected.takenBy}; customer tidak boleh ganda.` };

  await db.transaction(async (tx) => {
    if (before) await tx.update(schema.customer).set({ ...values, updatedAt: new Date() }).where(eq(schema.customer.id, recordId));
    else await tx.insert(schema.customer).values(record);
    await tx.insert(schema.auditLog).values({ actorUserId: s.userId, action: before ? "master.customer.update" : "master.customer.create", subjectType: "customer", subjectId: recordId, before: before ?? null, after: record });
  });
  revalidatePath("/master/customer");
  revalidatePath("/pipeline");
  return saved("Customer", recordId, customerIssues([record, ...all.filter((c) => c.id !== recordId)]));
}

/** Adds or changes a partner; an empty NPWP is saved with a warning (BR-MD-005). */
export async function savePartner(id: string | null, input: Input): Promise<Result> {
  const s = await steward("partner.manage", "Master Mitra diubah oleh SCM.", Partner, input);
  if ("refused" in s) return s.refused!;
  const all = await db.select().from(schema.partner);
  const before = all.find((p) => p.id === id);
  if (id && !before) return NOT_FOUND;
  const recordId = id ?? nextMasterId("Mitra", all.map((p) => p.id));
  const values = { ...s.data, npwp: cleanNpwp(s.data.npwp ?? "") };
  const record = { id: recordId, ...values };

  await db.transaction(async (tx) => {
    if (before) await tx.update(schema.partner).set({ ...values, updatedAt: new Date() }).where(eq(schema.partner.id, recordId));
    else await tx.insert(schema.partner).values(record);
    await tx.insert(schema.auditLog).values({ actorUserId: s.userId, action: before ? "master.partner.update" : "master.partner.create", subjectType: "partner", subjectId: recordId, before: before ?? null, after: record });
  });
  revalidatePath("/master/mitra");
  return saved("Mitra", recordId, partnerIssues([record, ...all.filter((p) => p.id !== recordId)]));
}

export async function saveProduct(id: string | null, input: Input): Promise<Result> {
  const s = await steward("partner.manage", "Master Produk Mitra diubah oleh SCM.", Product, input);
  if ("refused" in s) return s.refused!;
  const [partner] = await db.select().from(schema.partner).where(eq(schema.partner.id, s.data.partnerId));
  if (!partner) return { ok: false, message: "Mitra tidak ada di Master Mitra." };
  const all = await db.select().from(schema.partnerProduct);
  const before = all.find((p) => p.id === id);
  if (id && !before) return NOT_FOUND;
  const key = (p: { partnerId: string; category: string; type: string; brand: string }) => JSON.stringify([p.partnerId, p.category, p.type, p.brand]).toLowerCase();
  const twin = all.find((p) => p.id !== id && key(p) === key(s.data));
  if (twin) return { ok: false, message: `Produk ini sudah ada pada mitra tersebut (${twin.id}).` };
  const recordId = id ?? nextProductId(all.map((p) => p.id));
  const record = { id: recordId, ...s.data };

  await db.transaction(async (tx) => {
    if (before) await tx.update(schema.partnerProduct).set({ ...s.data, updatedAt: new Date() }).where(eq(schema.partnerProduct.id, recordId));
    else await tx.insert(schema.partnerProduct).values(record);
    await tx.insert(schema.auditLog).values({ actorUserId: s.userId, action: before ? "master.product.update" : "master.product.create", subjectType: "partner_product", subjectId: recordId, before: before ?? null, after: record });
  });
  revalidatePath("/master/produk");
  return saved("Produk", recordId, []);
}

/** Adds or changes an employee, and links the account with the same email. Accounts are managed on Pengguna. */
export async function saveEmployee(nip: string | null, input: Input): Promise<Result> {
  const s = await steward("employee.manage", "Master Karyawan diubah oleh HCM.", Employee, nip ? { ...input, nip } : input);
  if ("refused" in s) return s.refused!;
  const all = await db.select().from(schema.employee);
  const before = all.find((e) => e.nip === nip);
  if (nip && !before) return NOT_FOUND;
  const record = s.data;
  if (!nip && all.some((e) => e.nip === record.nip)) return { ok: false, message: `NIP ${record.nip} sudah dipakai.` };
  const twin = record.email ? all.find((e) => e.nip !== record.nip && e.email === record.email) : undefined;
  if (twin) return { ok: false, message: `Email sudah dipakai karyawan ${twin.nip}.` };

  await db.transaction(async (tx) => {
    const [account] = record.email ? await tx.select({ id: schema.user.id }).from(schema.user).where(sql`lower(${schema.user.email}) = ${record.email}`) : [];
    const values = { ...record, userId: account?.id ?? null };
    if (before) await tx.update(schema.employee).set({ ...values, updatedAt: new Date() }).where(eq(schema.employee.nip, record.nip));
    else await tx.insert(schema.employee).values(values);
    await tx.insert(schema.auditLog).values({ actorUserId: s.userId, action: before ? "master.employee.update" : "master.employee.create", subjectType: "employee", subjectId: record.nip, before: before ?? null, after: values });
  });
  revalidatePath("/master/karyawan");
  return { ok: true, message: `Karyawan ${record.nip} disimpan.` };
}
