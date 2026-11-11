/**
 * Loads the client's org chart (Struktur Organisasi) from a JSON file kept out of git, since it names people:
 *   pnpm db:struktur -- fixtures/struktur-organisasi.json [--dry-run]
 * Adds or renames units and gives each named head a seat; seats with an account are never touched and nothing is
 * deleted. Admin then links each name to an account on Struktur Organisasi.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { planStructure, type StructureFile } from "@estrada/domain";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  allowPositionals: true,
  options: { "dry-run": { type: "boolean", default: false } },
});

async function main() {
  const path = positionals[0];
  if (!path) throw new Error("Pakai: pnpm db:struktur -- <file.json> [--dry-run]");
  const file = JSON.parse(readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), path), "utf8")) as StructureFile;

  const [units, seats] = await Promise.all([
    db.select({ code: schema.orgUnit.code }).from(schema.orgUnit),
    db.select({ id: schema.position.id, orgUnit: schema.position.orgUnitCode, role: schema.position.role, holder: schema.position.holderUserId, holderName: schema.position.holderName }).from(schema.position),
  ]);
  const plan = planStructure(file, { units: units.map((u) => u.code), seats });
  if (plan.problems.length) throw new Error(`Struktur tidak dimuat:\n${plan.problems.join("\n")}`);

  const fresh = plan.units.filter((u) => !units.some((x) => x.code === u.code)).length;
  console.log(`${plan.units.length} unit (${fresh} baru), ${plan.create.length} posisi baru, ${plan.name.length} posisi diberi nama.`);
  if (values["dry-run"]) return;

  await db.transaction(async (tx) => {
    for (const u of plan.units) {
      await tx
        .insert(schema.orgUnit)
        .values({ code: u.code, name: u.name, type: u.type, parentCode: u.parent })
        .onConflictDoUpdate({ target: schema.orgUnit.code, set: { name: u.name, type: u.type, parentCode: u.parent } });
    }
    if (plan.create.length) await tx.insert(schema.position).values(plan.create.map((s) => ({ orgUnitCode: s.orgUnit, title: s.title, role: s.role, holderName: s.holderName })));
    for (const n of plan.name) await tx.update(schema.position).set({ holderName: n.holderName }).where(eq(schema.position.id, n.id));
  });
  console.log("Selesai.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
