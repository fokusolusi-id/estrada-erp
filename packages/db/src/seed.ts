/**
 * Master data from RKA_2027_Upd_Fin v2.xlsx (Mapping Entitas, COA Master).
 * The full COA Master and every RKA line come from @estrada/importers (pnpm db:import); this seeds the skeleton so the app runs.
 * With fixtures/COA Structured RKA 2027.xlsx present, `pnpm db:master` (run after this by `pnpm db:seed`) loads the full COA instead.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "./index";
import { sql } from "drizzle-orm";
import { coaAccount, companyEntity, orgUnit } from "./schema/index";
import { ENTITIES, ORG_UNITS } from "./seed-data";

async function main() {
  await db.insert(companyEntity).values([...ENTITIES]).onConflictDoNothing();
  await db
    .insert(orgUnit)
    .values(ORG_UNITS.map((u) => ({ ...u, aliases: [...u.aliases] })))
    .onConflictDoUpdate({ target: orgUnit.code, set: { aliases: sql`excluded.aliases` } });

  // SEED_COA=skeleton keeps the starter COA (e2e), so tests never depend on a file outside git.
  const structuredCoa = process.env.SEED_COA !== "skeleton" && existsSync(resolve(import.meta.dirname, "../../../fixtures/COA Structured RKA 2027.xlsx"));
  if (!structuredCoa) {
    await db
      .insert(coaAccount)
      .values([
        { code: "4100", name: "Pendapatan Sewa CPE", category: "Revenue", center: "revenue", defaultOwnerUnit: "BCD" },
        { code: "4150", name: "Instalasi, Managed service", category: "Revenue", center: "revenue", defaultOwnerUnit: "BCD" },
        { code: "4200", name: "Pendapatan Smart City", category: "Revenue", center: "revenue", defaultOwnerUnit: "BCD" },
        { code: "4900", name: "Pendapatan Lainnya", category: "Revenue", center: "revenue", defaultOwnerUnit: "BCD" },
        { code: "5100", name: "Biaya Pembelian Perangkat Keras", category: "COGS", center: "cost", defaultOwnerUnit: "PMO" },
        { code: "5300", name: "Biaya jaringan Internet", category: "COGS", center: "cost", defaultOwnerUnit: "PMO" },
        { code: "5700", name: "Biaya EOS", category: "COGS", center: "cost", defaultOwnerUnit: "HCM" },
        { code: "6211", name: "Beban Gaji dan THR", category: "OPEX", center: "cost", defaultOwnerUnit: "HCM" },
        { code: "6221", name: "Beban rekrutmen", category: "OPEX", center: "cost", defaultOwnerUnit: "HCM" },
        { code: "6241", name: "Beban internet", category: "OPEX", center: "cost", defaultOwnerUnit: "SCM" },
        { code: "6320", name: "Beban jasa profesional", category: "OPEX", center: "cost", defaultOwnerUnit: "FRM" },
        { code: "7221", name: "Beban bunga pinjaman bank", category: "OTHERS", center: "cost", defaultOwnerUnit: "FRM" },
      ])
      .onConflictDoNothing();
  }

  console.log("Seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
