/**
 * Loads the default master data from the client's three workbooks, kept out of git (they name people and hold the client's ledger):
 *   pnpm db:master [--brd "fixtures/BRD_MasterData_rini v5.xlsx"] [--coa "fixtures/COA Structured RKA 2027.xlsx"]
 *                  [--karyawan "fixtures/Data Karyawan Estrada Group (1).xlsx"] [--replace] [--only-file] [--dry-run]
 * Sheets read: "Sheet2" of the COA, "Data Karyawan (Okt)" of Data Karyawan, and "M Perusahaan", "33_Master_CostCenter", "M Organisasi", "M Customer", "Master Mitra", "Master Produk Mitra" of the BRD.
 * A file that is missing is skipped, so `pnpm db:seed` still runs without them. Nothing is deleted without --only-file.
 * --only-file: COA codes the file lacks are removed when unused, else retired (inactive, provisional) for Finance to move on COA Master.
 * COA: adds new codes and sets every code's tree and ledger attributes; a provisional code the file lists is confirmed. Name, category, default owner and active
 * stay as Finance set them, unless --replace (refused for a category change on a code that has RKA lines).
 * Perusahaan: fills the company fields still empty on existing entities (--replace follows the sheet, name included); an unknown ID stops the load.
 * Cost center: sets approval limit and function group on the mapped unit where empty (--replace follows the sheet) and adds the CC code as an alias.
 * Positions: level (M Organisasi) and function code (07_Org_Chart) where a unit plainly matches and the field is empty; the rest are listed.
 * Karyawan: adds new NIPs (the app keeps them afterwards; --replace follows the file) and links an existing account with the same email.
 * Customer: adds new IDs; existing ones stay as the steward left them, unless --replace (sheet columns only). A second customer with the same NPWP is
 * reported and not loaded; doubtful values are listed for review and loaded as written.
 * Mitra: adds new IDs, existing ones only change with --replace. Produk: adds combinations the app lacks and numbers them; a row for an unknown partner
 * stops the load. Doubtful values are listed for review.
 * Then pipeline deals without a customer are linked by nickname or legal name; the unmatched ones are listed.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, schema } from "@estrada/db";
import { COST_CENTER_UNITS, companyIssues, customerIssues, functionCodeFor, organisationUnitFor, nextProductId, partnerIssues, splitDuplicateNpwp } from "@estrada/domain";
import { codesOutsideFile, parseCoaStructured } from "./coa-structured";
import { parseCompanies } from "./companies";
import { parseCostCenters, parseOrganisationLevels } from "./cost-centers";
import { parseCustomers } from "./customers";
import { parseEmployees } from "./employees";
import { parsePartnerProducts, parsePartners } from "./partners";
import { sheetRows } from "./workbook";
import type { Cell } from "./cells";
import { linkDealCustomers, linkSummary } from "./link-customers";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    brd: { type: "string", default: "fixtures/BRD_MasterData_rini v5.xlsx" },
    coa: { type: "string", default: "fixtures/COA Structured RKA 2027.xlsx" },
    karyawan: { type: "string", default: "fixtures/Data Karyawan Estrada Group (1).xlsx" },
    replace: { type: "boolean", default: false },
    "only-file": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

// pnpm runs the script inside packages/importers; paths are relative to where the command was typed.
const root = process.env.INIT_CWD ?? resolve(import.meta.dirname, "../../..");
/** Opens a workbook; null (and said so) when the file is not there, so its sheets are skipped. */
async function open(path: string) {
  const full = resolve(root, path);
  if (!existsSync(full)) {
    console.log(`Lewati ${path}: file tidak ada.`);
    return null;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(full);
  return wb;
}

async function loadCoa(rows: Cell[][]) {
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
  if (values["only-file"]) await dropOutsideCodes(accounts.map((a) => a.code));
}

async function dropOutsideCodes(file: string[]) {
  const existing = (await db.select({ code: schema.coaAccount.code }).from(schema.coaAccount)).map((a) => a.code);
  const lines = await db.selectDistinct({ code: schema.budgetLine.coaCode }).from(schema.budgetLine);
  const deals = await db.selectDistinct({ code: schema.pipelineDeal.coaCode }).from(schema.pipelineDeal);
  const cash = await db.select({ a: schema.cashSetting.interestCoa, b: schema.cashSetting.nonCashCoa }).from(schema.cashSetting);
  const used = new Set([...lines, ...deals].flatMap((r) => (r.code ? [r.code] : [])).concat(cash.flatMap((c) => [c.a, c.b].flat().filter((x): x is string => !!x))));
  const { remove, retire } = codesOutsideFile(existing, file, used);

  await db.transaction(async (tx) => {
    if (retire.length) await tx.update(schema.coaAccount).set({ active: false, provisional: true, updatedAt: new Date() }).where(inArray(schema.coaAccount.code, retire));
    if (remove.length) await tx.delete(schema.coaAccount).where(inArray(schema.coaAccount.code, remove));
    if (remove.length || retire.length) await tx.insert(schema.auditLog).values({ action: "coa.only_file", subjectType: "coa_account", after: { remove, retire } });
  });
  console.log(`COA di luar file: dihapus ${remove.join(", ") || "tidak ada"}; dinonaktifkan karena masih dipakai ${retire.join(", ") || "tidak ada"}.`);
}

async function loadEmployees(rows: Cell[][]) {
  const entities = (await db.select({ code: schema.companyEntity.code }).from(schema.companyEntity)).map((e) => e.code);
  const units = new Set((await db.select({ code: schema.orgUnit.code }).from(schema.orgUnit)).map((u) => u.code));
  const employees = parseEmployees(rows, { entities });
  const missing = [...new Set(employees.map((e) => e.unitCode).filter((u): u is string => !!u && !units.has(u)))];
  if (missing.length) throw new Error(`Unit belum ada: ${missing.join(", ")}. Jalankan pnpm db:seed dulu.`);
  if (values["dry-run"]) return console.log(`Karyawan: ${employees.length} orang.`);

  await db.transaction(async (tx) => {
    for (const e of employees) {
      const { nip, ...rest } = e;
      const insert = tx.insert(schema.employee).values(e);
      await (values.replace ? insert.onConflictDoUpdate({ target: schema.employee.nip, set: { ...rest, updatedAt: new Date() } }) : insert.onConflictDoNothing({ target: schema.employee.nip }));
    }
    await tx
      .update(schema.employee)
      .set({ userId: sql`(select ${schema.user.id} from ${schema.user} where lower(${schema.user.email}) = ${schema.employee.email})` })
      .where(and(isNull(schema.employee.userId), sql`exists (select 1 from ${schema.user} where lower(${schema.user.email}) = ${schema.employee.email})`));
  });
  const [linked] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.employee).where(sql`${schema.employee.userId} is not null`);
  console.log(`Karyawan: ${employees.length} orang dimuat, ${linked?.n ?? 0} terhubung ke akun.`);
}

async function loadCompanies(rows: Cell[][]) {
  const parsed = parseCompanies(rows);
  const existing = new Map((await db.select().from(schema.companyEntity)).map((e) => [e.code, e]));
  const unknown = parsed.filter((c) => !existing.has(c.code)).map((c) => c.code);
  if (unknown.length) throw new Error(`Perusahaan ${unknown.join(", ")} belum ada di Unit & Entitas.`);

  let changed = 0;
  await db.transaction(async (tx) => {
    for (const { code, ...fields } of parsed) {
      const before = existing.get(code)!;
      const patch = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== null && (values.replace ? before[k as keyof typeof before] !== v : before[k as keyof typeof before] === null)));
      if (!Object.keys(patch).length) continue;
      changed++;
      if (values["dry-run"]) continue;
      await tx.update(schema.companyEntity).set(patch).where(eq(schema.companyEntity.code, code));
      await tx.insert(schema.auditLog).values({ action: "entity.import", subjectType: "company_entity", subjectId: code, before, after: patch });
    }
  });
  console.log(`Perusahaan: ${parsed.length} di file, ${changed} ${values["dry-run"] ? "akan diperbarui" : "diperbarui"}.`);
  const issues = companyIssues(parsed);
  if (issues.length) console.log(`  Perlu ditinjau:\n${issues.map((i) => `    ${i.code}: ${i.message}`).join("\n")}`);
}

async function loadCostCenters(rows: Cell[][]) {
  const parsed = parseCostCenters(rows);
  const units = new Map((await db.select().from(schema.orgUnit)).map((u) => [u.code, u]));
  const skipped: string[] = [];
  let changed = 0;
  await db.transaction(async (tx) => {
    for (const c of parsed) {
      const unit = units.get(COST_CENTER_UNITS[c.code] ?? "");
      if (!unit) {
        skipped.push(`${c.code} ${c.name} (limit ${c.approvalLimit})`);
        continue;
      }
      const patch: Partial<typeof schema.orgUnit.$inferInsert> = {};
      if (unit.approvalLimit === null || (values.replace && unit.approvalLimit !== c.approvalLimit)) patch.approvalLimit = c.approvalLimit;
      if (unit.functionGroup === null || (values.replace && unit.functionGroup !== c.functionGroup)) patch.functionGroup = c.functionGroup;
      if (!unit.aliases.includes(c.code)) patch.aliases = [...unit.aliases, c.code];
      if (!Object.keys(patch).length) continue;
      changed++;
      if (values["dry-run"]) continue;
      await tx.update(schema.orgUnit).set(patch).where(eq(schema.orgUnit.code, unit.code));
      await tx.insert(schema.auditLog).values({ action: "unit.import_cost_center", subjectType: "org_unit", subjectId: unit.code, before: unit, after: patch });
    }
  });
  console.log(`Cost center: ${parsed.length} di file, ${changed} unit ${values["dry-run"] ? "akan diperbarui" : "diperbarui"}.`);
  for (const s of skipped) console.log(`  Tanpa unit: ${s}.`);
}

async function loadPositionTags(rows: Cell[][]) {
  const levels = parseOrganisationLevels(rows);
  const positions = await db.select().from(schema.position);
  const levelOf = new Map<string, number>();
  const skipped: string[] = [];
  for (const row of levels) {
    const unit = organisationUnitFor(row.job);
    // A division head sits in the unit's division_owner or director seat; otherwise the unit must have one seat.
    const inUnit = positions.filter((p) => p.orgUnitCode === unit);
    const heads = inUnit.filter((p) => p.role === "division_owner" || p.role === "director");
    const seat = heads.length === 1 ? heads[0] : inUnit.length === 1 ? inUnit[0] : undefined;
    if (seat) levelOf.set(seat.id, row.level);
    else skipped.push(`${row.name} (${row.job}, level ${row.level})`);
  }
  let changed = 0;
  await db.transaction(async (tx) => {
    for (const p of positions) {
      const code = functionCodeFor(p.orgUnitCode);
      const patch: Partial<typeof schema.position.$inferInsert> = {};
      if (p.level === null && levelOf.has(p.id)) patch.level = levelOf.get(p.id)!;
      if (!p.functionCodes.length && code) patch.functionCodes = [code];
      if (!Object.keys(patch).length) continue;
      changed++;
      if (!values["dry-run"]) await tx.update(schema.position).set(patch).where(eq(schema.position.id, p.id));
    }
  });
  console.log(`Posisi: ${changed} ${values["dry-run"] ? "akan diberi" : "diberi"} level atau kode fungsi.`);
  if (skipped.length) console.log(`  M Organisasi tanpa posisi yang pasti: ${skipped.join("; ")}.`);
}

async function loadCustomers(rows: Cell[][]) {
  const parsed = parseCustomers(rows);
  const existing = await db.select({ id: schema.customer.id, npwp: schema.customer.npwp }).from(schema.customer);
  const known = new Set(existing.map((c) => c.id));
  const incoming = values.replace ? parsed : parsed.filter((c) => !known.has(c.id));
  const { accepted, rejected } = splitDuplicateNpwp(incoming, existing);

  if (!values["dry-run"]) {
    await db.transaction(async (tx) => {
      for (const c of accepted) {
        const { id, ...rest } = c;
        await tx
          .insert(schema.customer)
          .values(c)
          .onConflictDoUpdate({ target: schema.customer.id, set: { ...rest, updatedAt: new Date() } });
      }
    });
  }
  const added = accepted.filter((c) => !known.has(c.id)).length;
  console.log(`Customer: ${parsed.length} di file, ${added} ${values["dry-run"] ? "akan ditambahkan" : "ditambahkan"}, ${accepted.length - added} diperbarui.`);
  for (const r of rejected) console.log(`  Ditolak ${r.id}: NPWP ${r.npwp} sudah dipakai ${r.takenBy}.`);
  const skipped = new Set(rejected.map((r) => r.id));
  const issues = customerIssues(parsed.filter((c) => !skipped.has(c.id)));
  if (issues.length) console.log(`  Perlu ditinjau:\n${issues.map((i) => `    ${i.id}: ${i.message}`).join("\n")}`);
}

async function loadPartners(rows: Cell[][]) {
  const parsed = parsePartners(rows);
  const known = new Set((await db.select({ id: schema.partner.id }).from(schema.partner)).map((p) => p.id));
  const accepted = values.replace ? parsed : parsed.filter((p) => !known.has(p.id));

  if (!values["dry-run"]) {
    await db.transaction(async (tx) => {
      for (const p of accepted) {
        const { id, ...rest } = p;
        await tx
          .insert(schema.partner)
          .values(p)
          .onConflictDoUpdate({ target: schema.partner.id, set: { ...rest, updatedAt: new Date() } });
      }
    });
  }
  const added = accepted.filter((p) => !known.has(p.id)).length;
  console.log(`Mitra: ${parsed.length} di file, ${added} ${values["dry-run"] ? "akan ditambahkan" : "ditambahkan"}, ${accepted.length - added} diperbarui.`);
  const issues = partnerIssues(parsed);
  if (issues.length) console.log(`  Perlu ditinjau:\n${issues.map((i) => `    ${i.id}: ${i.message}`).join("\n")}`);
}

async function loadPartnerProducts(rows: Cell[][]) {
  const parsed = parsePartnerProducts(rows);
  const partners = new Map((await db.select({ id: schema.partner.id, name: schema.partner.name }).from(schema.partner)).map((p) => [p.id, p.name]));
  const unknown = [...new Set(parsed.map((p) => p.partnerId).filter((id) => !partners.has(id)))];
  // A dry run has not written the partners the same run would add.
  if (unknown.length && !values["dry-run"]) throw new Error(`Produk Mitra: mitra ${unknown.join(", ")} belum ada di Master Mitra.`);

  const existing = await db.select().from(schema.partnerProduct);
  const key = (p: { partnerId: string; category: string; type: string; brand: string }) => JSON.stringify([p.partnerId, p.category, p.type, p.brand]).toLowerCase();
  const have = new Set(existing.map(key));
  const ids = existing.map((p) => p.id);
  const added = parsed
    .filter((p) => !have.has(key(p)))
    .map(({ partnerName: _, ...p }) => {
      const id = nextProductId(ids);
      ids.push(id);
      return { id, ...p };
    });
  if (added.length && !values["dry-run"]) await db.insert(schema.partnerProduct).values(added);
  console.log(`Produk Mitra: ${parsed.length} di file, ${added.length} ${values["dry-run"] ? "akan ditambahkan" : "ditambahkan"}.`);
  for (const p of parsed) {
    const name = partners.get(p.partnerId);
    if (name && p.partnerName && name.toLowerCase() !== p.partnerName.toLowerCase()) console.log(`  Perlu ditinjau ${p.partnerId}: nama di sheet produk "${p.partnerName}" berbeda dari Master Mitra "${name}".`);
  }
}

async function main() {
  const coa = await open(values.coa);
  if (coa) await loadCoa(sheetRows(coa, "Sheet2"));
  const karyawan = await open(values.karyawan);
  if (karyawan) await loadEmployees(sheetRows(karyawan, "Data Karyawan (Okt)"));
  const brd = await open(values.brd);
  if (brd) {
    await loadCompanies(sheetRows(brd, "M Perusahaan"));
    await loadCostCenters(sheetRows(brd, "33_Master_CostCenter"));
    await loadPositionTags(sheetRows(brd, "M Organisasi"));
    await loadCustomers(sheetRows(brd, "M Customer"));
    await loadPartners(sheetRows(brd, "Master Mitra"));
    await loadPartnerProducts(sheetRows(brd, "Master Produk Mitra"));
  }
  if (!values["dry-run"]) console.log(linkSummary(await linkDealCustomers(db)));
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
