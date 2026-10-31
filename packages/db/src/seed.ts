/**
 * Master data from RKA_2027_Upd_Fin v2.xlsx (Mapping Entitas, COA Master).
 * Full COA import comes from @estrada/importers; this seeds the skeleton so the app runs.
 */
import { db } from "./index";
import { budgetLine, budgetLineAmount, budgetVersion, coaAccount, companyEntity, orgUnit } from "./schema/index";

async function main() {
  await db
    .insert(companyEntity)
    .values([
      { code: "ESTRADA", name: "PT Elang Strategi Adidaya", costType: "indirect" },
      { code: "MATRIK", name: "MATRIK", costType: "direct" },
      { code: "DJALU", name: "DJALU", costType: "direct" },
      { code: "PAS", name: "PAS", costType: "direct" },
    ])
    .onConflictDoNothing();

  await db
    .insert(orgUnit)
    .values([
      { code: "DIR", name: "Direktur", type: "company", parentCode: null },
      { code: "FRM", name: "Finance & Risk Management", type: "division", parentCode: "DIR" },
      { code: "HCM", name: "Human Capital Management", type: "division", parentCode: "DIR" },
      { code: "PDMS", name: "Project Delivery & Managed Service", type: "division", parentCode: "DIR" },
      { code: "PMO", name: "Project Management Office", type: "department", parentCode: "PDMS" },
      { code: "SCM", name: "Supply Chain Management", type: "department", parentCode: "PDMS" },
      { code: "ISO", name: "Integrated Service Operations", type: "department", parentCode: "PDMS" },
      { code: "MSO", name: "Managed Service Operation", type: "department", parentCode: "PDMS" },
      { code: "BCD", name: "Business Commercial Division", type: "division", parentCode: "DIR", aliases: ["CBD", "SPA"] },
      { code: "PST", name: "Product Solution & Technology", type: "division", parentCode: "DIR", aliases: ["BSD"] },
    ])
    .onConflictDoNothing();

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
      { code: "6241", name: "Beban internet", category: "OPEX", center: "cost", defaultOwnerUnit: "SCM" },
      { code: "6320", name: "Beban jasa profesional", category: "OPEX", center: "cost", defaultOwnerUnit: "FRM" },
      { code: "7221", name: "Beban bunga pinjaman bank", category: "OTHERS", center: "cost", defaultOwnerUnit: "FRM" },
    ])
    .onConflictDoNothing();

  // Demo version with SCM lines from the Project Delivery & Managed Serv sheet (rows 19–21).
  const existing = await db.select({ id: budgetVersion.id }).from(budgetVersion).limit(1);
  if (!existing.length) {
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

  console.log("Seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
