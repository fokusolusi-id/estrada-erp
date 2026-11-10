"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { canCash, carryCashForward } from "@estrada/domain";
import { loadCash } from "@/lib/cash";
import { reportVersions } from "@/lib/rka";
import { requireUser } from "@/lib/session";

type Result = { ok: boolean; message: string };

const Amount = z.string().regex(/^\d+(\.\d{1,2})?$/);
const Fraction = z.string().regex(/^(0(\.\d{1,6})?|1(\.0{1,6})?)$/);
const Codes = z.array(z.string().max(20)).max(50);

async function finance(): Promise<{ userId: string; year: number } | Result> {
  const user = await requireUser();
  if (!canCash(user.actor, "manage")) return { ok: false, message: "Hanya Finance yang dapat mengubah arus kas." };
  const [version] = await reportVersions();
  if (!version) return { ok: false, message: "Belum ada siklus RKA." };
  return { userId: user.id, year: version.fiscalYear };
}

async function unknownEntities(codes: string[]) {
  const known = new Set((await db.select({ code: schema.companyEntity.code }).from(schema.companyEntity)).map((e) => e.code));
  return codes.filter((c) => !known.has(c));
}

const Assumptions = z.object({
  collectionLag: z.number().int().min(0).max(12),
  cogsPaymentLag: z.number().int().min(0).max(12),
  taxRate: Fraction,
  minimumCash: Amount,
  interestCoa: Codes,
  nonCashCoa: Codes,
  openings: z.record(z.string().max(20), z.object({ cash: Amount, receivables: Amount, payables: Amount, priorYearTax: Amount, minimumCash: Amount })),
});

/** The year's cash rules and each entity's 1 January position, replaced in one go with an audit entry. */
export async function saveCashAssumptions(input: z.input<typeof Assumptions>): Promise<Result> {
  const who = await finance();
  if ("ok" in who) return who;
  const parsed = Assumptions.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Asumsi tidak valid." };
  const a = parsed.data;
  if ((await unknownEntities(Object.keys(a.openings))).length) return { ok: false, message: "Entitas tidak dikenal." };
  const codes = [...new Set([...a.interestCoa, ...a.nonCashCoa])];
  const found = codes.length ? await db.select({ code: schema.coaAccount.code }).from(schema.coaAccount).where(inArray(schema.coaAccount.code, codes)) : [];
  const missing = codes.filter((c) => !found.some((f) => f.code === c));
  if (missing.length) return { ok: false, message: `COA tidak dikenal: ${missing.join(", ")}` };

  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.cashSetting).where(eq(schema.cashSetting.fiscalYear, who.year));
    const setting = { collectionLag: a.collectionLag, cogsPaymentLag: a.cogsPaymentLag, taxRate: a.taxRate, minimumCash: a.minimumCash, interestCoa: a.interestCoa, nonCashCoa: a.nonCashCoa };
    await tx
      .insert(schema.cashSetting)
      .values({ fiscalYear: who.year, ...setting })
      .onConflictDoUpdate({ target: schema.cashSetting.fiscalYear, set: { ...setting, updatedAt: new Date() } });
    await tx.delete(schema.cashOpening).where(eq(schema.cashOpening.fiscalYear, who.year));
    const rows = Object.entries(a.openings).map(([entityCode, o]) => ({ fiscalYear: who.year, entityCode, ...o }));
    if (rows.length) await tx.insert(schema.cashOpening).values(rows);
    await tx.insert(schema.auditLog).values({ actorUserId: who.userId, action: "cash.assumptions", subjectType: "cash", subjectId: String(who.year), before: before ?? null, after: a });
  });
  revalidatePath("/cash");
  return { ok: true, message: "Asumsi disimpan." };
}

const Loan = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(200),
  type: z.enum(["existing", "new"]),
  entity: z.string().max(20),
  rate: Fraction,
  openingBalance: Amount,
  creditLimit: Amount.nullable(),
  notes: z.string().max(1000).nullable(),
  drawdown: z.array(Amount).length(12),
  repayment: z.array(Amount).length(12),
});

/** Adds or updates a facility and its monthly drawdowns and repayments. */
export async function saveLoan(input: z.input<typeof Loan>): Promise<Result> {
  const who = await finance();
  if ("ok" in who) return who;
  const parsed = Loan.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Data fasilitas tidak valid." };
  const { id, entity, drawdown, repayment, ...f } = parsed.data;
  if ((await unknownEntities([entity])).length) return { ok: false, message: "Entitas tidak dikenal." };
  if (id) {
    const [row] = await db.select().from(schema.loanFacility).where(and(eq(schema.loanFacility.id, id), eq(schema.loanFacility.fiscalYear, who.year)));
    if (!row) return { ok: false, message: "Fasilitas tidak ditemukan." };
  }

  const values = { ...f, entityCode: entity };
  await db.transaction(async (tx) => {
    const facilityId = id
      ? (await tx.update(schema.loanFacility).set(values).where(eq(schema.loanFacility.id, id)).returning({ id: schema.loanFacility.id }))[0]!.id
      : (await tx.insert(schema.loanFacility).values({ ...values, fiscalYear: who.year }).returning({ id: schema.loanFacility.id }))[0]!.id;
    await tx.delete(schema.loanMove).where(eq(schema.loanMove.facilityId, facilityId));
    const moves = drawdown
      .map((d, i) => ({ facilityId, month: i + 1, drawdown: d, repayment: repayment[i]! }))
      .filter((m) => Number(m.drawdown) !== 0 || Number(m.repayment) !== 0);
    if (moves.length) await tx.insert(schema.loanMove).values(moves);
    await tx.insert(schema.auditLog).values({
      actorUserId: who.userId,
      action: id ? "loan.update" : "loan.create",
      subjectType: "loan_facility",
      subjectId: facilityId,
      after: { ...values, drawdown, repayment },
    });
  });
  revalidatePath("/cash");
  return { ok: true, message: "Fasilitas disimpan." };
}

export async function deleteLoan(id: string): Promise<Result> {
  const who = await finance();
  if ("ok" in who) return who;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Permintaan tidak valid." };
  const [before] = await db.select().from(schema.loanFacility).where(and(eq(schema.loanFacility.id, id), eq(schema.loanFacility.fiscalYear, who.year)));
  if (!before) return { ok: false, message: "Fasilitas tidak ditemukan." };
  await db.transaction(async (tx) => {
    await tx.delete(schema.loanFacility).where(eq(schema.loanFacility.id, id));
    await tx.insert(schema.auditLog).values({ actorUserId: who.userId, action: "loan.delete", subjectType: "loan_facility", subjectId: id, before });
  });
  revalidatePath("/cash");
  return { ok: true, message: "Fasilitas dihapus." };
}

/**
 * Starts a year's cash plan from the year before: rules as they were, each entity's opening at last December's
 * closing cash, receivables and payables, and loans at their December outstanding. Finance then checks the figures
 * against the audited balance sheet and enters last year's PPh 29.
 */
export async function carryCashFromPrior(): Promise<Result> {
  const who = await finance();
  if ("ok" in who) return who;
  const user = await requireUser();
  const [existing] = await db.select().from(schema.cashSetting).where(eq(schema.cashSetting.fiscalYear, who.year));
  if (existing) return { ok: false, message: `Asumsi arus kas ${who.year} sudah ada.` };
  const prior = await loadCash(user, who.year - 1);
  if (!prior?.settings) return { ok: false, message: `Belum ada arus kas ${who.year - 1} untuk dibawa.` };

  const carried = carryCashForward(
    new Map(
      prior.entities
        .filter((e) => prior.forecasts.has(e))
        .map((e) => [e, { rows: prior.forecasts.get(e)!.rows, minimumCash: prior.openings.get(e)?.minimumCash ?? prior.settings!.minimumCash }]),
    ),
    prior.facilities.map((f) => ({ name: f.name, type: f.type, entity: f.entity, rate: f.rate, creditLimit: f.creditLimit, notes: f.notes, outstanding: f.outstanding })),
  );
  const s = prior.settings;
  await db.transaction(async (tx) => {
    await tx.insert(schema.cashSetting).values({
      fiscalYear: who.year,
      collectionLag: s.collectionLag,
      cogsPaymentLag: s.cogsPaymentLag,
      taxRate: s.taxRate,
      minimumCash: s.minimumCash.toFixed(2),
      interestCoa: [...s.interestCoa],
      nonCashCoa: [...s.nonCashCoa],
    });
    const openings = [...carried.openings].map(([entityCode, o]) => ({
      fiscalYear: who.year,
      entityCode,
      cash: o.cash.toFixed(2),
      receivables: o.receivables.toFixed(2),
      payables: o.payables.toFixed(2),
      priorYearTax: o.priorYearTax.toFixed(2),
      minimumCash: o.minimumCash.toFixed(2),
    }));
    if (openings.length) await tx.insert(schema.cashOpening).values(openings);
    for (const f of carried.facilities) {
      await tx.insert(schema.loanFacility).values({
        fiscalYear: who.year,
        name: f.name,
        type: f.type,
        entityCode: f.entity,
        rate: f.rate,
        openingBalance: f.openingBalance.toFixed(2),
        creditLimit: f.creditLimit?.toFixed(2) ?? null,
        notes: f.notes,
      });
    }
    await tx.insert(schema.auditLog).values({
      actorUserId: who.userId,
      action: "cash.carry_forward",
      subjectType: "cash",
      subjectId: String(who.year),
      after: { from: who.year - 1, entities: openings.length, facilities: carried.facilities.length },
    });
  });
  revalidatePath("/cash");
  return { ok: true, message: `Arus kas ${who.year} dimulai dari Desember ${who.year - 1}. Periksa saldo awal dan isi PPh 29.` };
}
