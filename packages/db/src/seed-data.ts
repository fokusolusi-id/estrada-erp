/** Master data from RKA_2027_Upd_Fin v2.xlsx (Mapping Entitas, org chart), shared by the seed and the importer. */
export const ENTITIES = [
  { code: "ESTRADA", name: "PT Elang Strategi Adidaya", costType: "indirect" },
  { code: "MATRIK", name: "MATRIK", costType: "direct" },
  { code: "DJALU", name: "DJALU", costType: "direct" },
  { code: "PAS", name: "PAS", costType: "direct" },
] as const;

/** Aliases are the names the workbook still uses: CBD and SPA for BCD, "Sales" as COA Master's budget owner. */
export const ORG_UNITS = [
  { code: "DIR", name: "Direktur", type: "company", parentCode: null, aliases: [] },
  { code: "FRM", name: "Finance & Risk Management", type: "division", parentCode: "DIR", aliases: [] },
  { code: "HCM", name: "Human Capital Management", type: "division", parentCode: "DIR", aliases: [] },
  { code: "PDMS", name: "Project Delivery & Managed Service", type: "division", parentCode: "DIR", aliases: [] },
  { code: "PMO", name: "Project Management Office", type: "department", parentCode: "PDMS", aliases: [] },
  { code: "SCM", name: "Supply Chain Management", type: "department", parentCode: "PDMS", aliases: [] },
  { code: "ISO", name: "Integrated Service Operations", type: "department", parentCode: "PDMS", aliases: [] },
  { code: "MSO", name: "Managed Service Operation", type: "department", parentCode: "PDMS", aliases: [] },
  { code: "BCD", name: "Business Commercial Division", type: "division", parentCode: "DIR", aliases: ["CBD", "SPA", "Sales"] },
  { code: "PST", name: "Product Solution & Technology", type: "division", parentCode: "DIR", aliases: ["BSD"] },
] as const;
