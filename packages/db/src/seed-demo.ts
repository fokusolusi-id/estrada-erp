/**
 * Demo RKA version, after the COA is in (pnpm db:seed runs it last). Never in production: the real RKA comes from
 * `pnpm db:import`. Set SEED_DEMO=1 to force it.
 */
import { db } from "./index";
import { budgetLine, budgetLineAmount, budgetVersion } from "./schema/index";

async function main() {
  const withDemo = process.env.SEED_DEMO === "1" || process.env.NODE_ENV !== "production";
  const existing = await db.select({ id: budgetVersion.id }).from(budgetVersion).limit(1);
  if (withDemo && !existing.length) {
    const [version] = await db
      .insert(budgetVersion)
      .values({ fiscalYear: 2027, name: "RKA 2027 (demo)" })
      .returning({ id: budgetVersion.id });
    const demo = [
      { coaCode: "6241", monthly: "19821320", basis: "Kontrak internet kantor 2027" },
      { coaCode: "5300", monthly: "390686823.67", basis: "Bandwidth pelanggan, tarif berjalan" },
    ];
    for (const d of demo) {
      const [line] = await db
        .insert(budgetLine)
        .values({ versionId: version!.id, coaCode: d.coaCode, entityCode: "ESTRADA", requestorUnit: "SCM", ownerUnit: "SCM", basis: d.basis })
        .returning({ id: budgetLine.id });
      await db
        .insert(budgetLineAmount)
        .values(Array.from({ length: 12 }, (_, i) => ({ lineId: line!.id, month: i + 1, amount: d.monthly })));
    }
  }

  console.log("Demo seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
