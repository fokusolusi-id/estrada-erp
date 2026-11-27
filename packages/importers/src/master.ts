/**
 * Loads the default master data from CSVs kept out of git (they name people and hold the client's ledger):
 *   pnpm db:master [--coa fixtures/coa-structured-rka-2027.csv] [--karyawan fixtures/data-karyawan.csv] [--replace] [--dry-run]
 * A file that is missing is skipped, so `pnpm db:seed` still runs without them. Nothing is deleted.
 * COA: adds new codes and sets every code's tree and ledger attributes; a provisional code the file lists is confirmed. Name, category, default owner and active
 * stay as Finance set them, unless --replace (refused for a category change on a code that has RKA lines).
 * Karyawan: upserts by NIP and links an existing account with the same email.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { and, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { parseCsv } from "./csv";
import { parseCoaStructured } from "./coa-structured";
import { parseEmployees } from "./employees";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    coa: { type: "string", default: "fixtures/coa-structured-rka-2027.csv" },
    karyawan: { type: "string", default: "fixtures/data-karyawan.csv" },
    replace: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

// pnpm runs the script inside packages/importers; paths are relative to where the command was typed.
const root = process.env.INIT_CWD ?? resolve(import.meta.dirname, "../../..");
const read = (path: string) => {
  const full = resolve(root, path);
  if (!existsSync(full)) {
    console.log(`Lewati ${path}: file tidak ada.`);
    return null;
  }
  return parseCsv(readFileSync(full, "utf8"));
};

async function loadCoa(rows: string[][]) {
  const units = await db.select({ code: schema.orgUnit.code, aliases: schema.orgUnit.aliases }).from(schema.orgUnit);
  const { accounts, segments } = parseCoaStructured(rows, units);

  const existing = new Map((await db.select({ code: schema.coaAccount.code, category: schema.coaAccount.category }).from(schema.coaAccount)).map((a) => [a.code, a]));
  const moved = accounts.filter((a) => existing.has(a.code) && existing.get(a.code)!.category !== a.category);
  if (moved.length) {
    const used = await db
      .selectDistinct({ code: schema.budgetLine.coaCode })
      .from(schema.budgetLine)
      .where(inArray(schema.budgetLine.coaCode, moved.map((a) => a.code)));
    const list = moved.map((a) => `${a.code} ${existing.get(a.code)!.category}→${a.category}`).join(", ");
    if (values.replace && used.length) throw new Error(`Kategori tidak diubah: kode ${used.map((u) => u.code).join(", ")} sudah dipakai baris RKA.`);
    console.log(values.replace ? `Kategori diubah: ${list}` : `Kategori berbeda dari file (dibiarkan, pakai --replace untuk mengikuti file): ${list}`);
  }
  if (values["dry-run"]) return console.log(`COA: ${accounts.length} akun (${accounts.filter((a) => !existing.has(a.code)).length} baru), ${segments.length} segmen.`);

  await db.transaction(async (tx) => {
    // Parents first, so every parentCode already exists when its child is written.
    for (const a of [...accounts].sort((x, y) => x.level - y.level)) {
      const structure = {
        level: a.level,
        parentCode: a.parentCode,
        accountType: a.accountType,
        normalBalance: a.normalBalance,
        statement: a.statement,
        postable: a.postable,
        segmented: a.segmented,
        note: a.note,
        requestorUnits: a.requestorUnits,
        ownerUnits: a.ownerUnits,
        // A workbook code Finance's structured COA lists is no longer provisional.
        provisional: false,
      };
      const owned = { name: a.name, category: a.category, center: a.center, defaultOwnerUnit: a.defaultOwnerUnit, active: true };
      await tx
        .insert(schema.coaAccount)
        .values({ code: a.code, ...owned, ...structure })
        .onConflictDoUpdate({ target: schema.coaAccount.code, set: { ...structure, ...(values.replace ? owned : {}), updatedAt: new Date() } });
    }
    for (const s of segments) {
      await tx.insert(schema.coaSegment).values(s).onConflictDoUpdate({ target: schema.coaSegment.code, set: { name: s.name, description: s.description } });
    }
  });
  console.log(`COA: ${accounts.length} akun, ${segments.length} segmen dimuat.`);
}

async function loadEmployees(rows: string[][]) {
  const entities = (await db.select({ code: schema.companyEntity.code }).from(schema.companyEntity)).map((e) => e.code);
  const units = new Set((await db.select({ code: schema.orgUnit.code }).from(schema.orgUnit)).map((u) => u.code));
  const employees = parseEmployees(rows, { entities });
  const missing = [...new Set(employees.map((e) => e.unitCode).filter((u): u is string => !!u && !units.has(u)))];
  if (missing.length) throw new Error(`Unit belum ada: ${missing.join(", ")}. Jalankan pnpm db:seed dulu.`);
  if (values["dry-run"]) return console.log(`Karyawan: ${employees.length} orang.`);

  await db.transaction(async (tx) => {
    for (const e of employees) {
      const { nip, ...rest } = e;
      await tx
        .insert(schema.employee)
        .values(e)
        .onConflictDoUpdate({ target: schema.employee.nip, set: { ...rest, updatedAt: new Date() } });
    }
    await tx
      .update(schema.employee)
      .set({ userId: sql`(select ${schema.user.id} from ${schema.user} where lower(${schema.user.email}) = ${schema.employee.email})` })
      .where(and(isNull(schema.employee.userId), sql`exists (select 1 from ${schema.user} where lower(${schema.user.email}) = ${schema.employee.email})`));
  });
  const [linked] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.employee).where(sql`${schema.employee.userId} is not null`);
  console.log(`Karyawan: ${employees.length} orang dimuat, ${linked?.n ?? 0} terhubung ke akun.`);
}

async function main() {
  const coa = read(values.coa);
  if (coa) await loadCoa(coa);
  const karyawan = read(values.karyawan);
  if (karyawan) await loadEmployees(karyawan);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
