"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { can } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import type { BankAccountInput } from "@/components/erp/bank-accounts";

const AccountSchema = z.object({
  id: z.string().uuid().nullable(),
  entity: z.string().min(1, "Pilih entitas"),
  bankName: z.string().trim().min(2, "Nama bank wajib diisi").max(60),
  accountNumber: z.string().trim().regex(/^[0-9][0-9 .-]{2,30}$/, "Nomor rekening hanya angka, spasi, titik atau tanda hubung"),
  accountName: z.string().trim().min(2, "Atas nama wajib diisi").max(120),
  active: z.boolean(),
});

/** Adds or edits a company bank account (bank asal). Accounts are deactivated, never deleted, so paid requests keep theirs. */
export async function saveBankAccount(input: BankAccountInput): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (!can(user.actor, "bank.manage", null, await loadOrg())) return { ok: false, message: "Hanya Cash Management atau Admin yang dapat mengelola rekening." };
  const parsed = AccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const a = parsed.data;
  const { entities } = user.actor;
  if (!entities.includes("*") && !entities.includes(a.entity)) return { ok: false, message: "Entitas di luar cakupan Anda." };

  const [entity] = await db.select().from(schema.companyEntity).where(eq(schema.companyEntity.code, a.entity));
  if (!entity) return { ok: false, message: "Entitas tidak dikenal." };
  const [dup] = await db
    .select({ id: schema.companyBankAccount.id })
    .from(schema.companyBankAccount)
    .where(
      and(
        eq(schema.companyBankAccount.bankName, a.bankName),
        eq(schema.companyBankAccount.accountNumber, a.accountNumber),
        ...(a.id ? [ne(schema.companyBankAccount.id, a.id)] : []),
      ),
    );
  if (dup) return { ok: false, message: "Nomor rekening sudah terdaftar." };

  const values = { entityCode: a.entity, bankName: a.bankName, accountNumber: a.accountNumber, accountName: a.accountName };
  const ok = await db.transaction(async (tx) => {
    if (a.id) {
      const [before] = await tx.select().from(schema.companyBankAccount).where(eq(schema.companyBankAccount.id, a.id));
      if (!before) return false;
      // The entity stays: payments already scheduled from this account belong to it.
      await tx.update(schema.companyBankAccount).set({ ...values, entityCode: before.entityCode, active: a.active }).where(eq(schema.companyBankAccount.id, a.id));
      await tx.insert(schema.auditLog).values({
        actorUserId: user.id,
        action: "bank_account.update",
        subjectType: "company_bank_account",
        subjectId: a.id,
        before: { bankName: before.bankName, accountNumber: before.accountNumber, accountName: before.accountName, active: before.active },
        after: { bankName: a.bankName, accountNumber: a.accountNumber, accountName: a.accountName, active: a.active },
      });
      return true;
    }
    const [row] = await tx.insert(schema.companyBankAccount).values(values).returning({ id: schema.companyBankAccount.id });
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "bank_account.create", subjectType: "company_bank_account", subjectId: row!.id, after: values });
    return true;
  });
  if (!ok) return { ok: false, message: "Rekening tidak ditemukan." };
  revalidatePath("/pembayaran/rekening");
  return { ok: true, message: a.id ? "Rekening disimpan." : "Rekening ditambahkan." };
}
