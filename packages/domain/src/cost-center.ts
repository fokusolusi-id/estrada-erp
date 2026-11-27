/** Cost center = org unit (plan decision 5): sheets 33_Master_CostCenter, 07_Org_Chart and M Organisasi. */

export const FUNCTION_GROUPS = ["Revenue", "Delivery", "Support", "Governance"] as const;
export type FunctionGroup = (typeof FUNCTION_GROUPS)[number];

/** The sheet's cost center codes, kept as unit aliases. CC-008 IT & Infrastructure has no unit (client decision). */
export const COST_CENTER_UNITS: Readonly<Record<string, string>> = {
  "CC-001": "BCD",
  "CC-002": "PST",
  "CC-003": "PMO",
  "CC-004": "SCM",
  "CC-005": "ISO",
  "CC-006": "FRM",
  "CC-007": "HCM",
  "CC-009": "FRM-LCM",
  "CC-010": "BCD-MKT",
  "CC-011": "FRM-RCI",
  "CC-012": "DIR",
};

/** F0–F6; F6 is the GEN2 unit. */
export const FUNCTION_CODES = ["F0", "F1", "F2", "F3", "F4", "F5", "F6"] as const;

/** "F1&F2, F6-GEN2" → F1, F2, F6; null when something else is written. */
export function parseFunctionCodes(value: string): string[] | null {
  const codes = value
    .toUpperCase()
    .replace(/-GEN2/g, "")
    .split(/[,&\s]+/)
    .filter(Boolean);
  return codes.every((c) => (FUNCTION_CODES as readonly string[]).includes(c)) ? [...new Set(codes)] : null;
}

/** The units a function of 07_Org_Chart plainly is. F1, F2, F4 and F6 match no single unit; Admin tags those. */
const UNIT_FUNCTIONS: readonly [string, string][] = [
  ["FRM", "F5"],
  ["HCM", "F0"],
  ["SCM", "F3"],
];
export const functionCodeFor = (unit: string): string | null => UNIT_FUNCTIONS.find(([root]) => unit === root || unit.startsWith(`${root}-`))?.[1] ?? null;

/** M Organisasi jobs that name exactly one unit. */
const JOB_UNITS: Readonly<Record<string, string>> = {
  direktur: "DIR",
  "head finance & risk management": "FRM",
  "business finance & pricing": "FRM-FIN-BFP",
  "cash mngmnt & treasury": "FRM-FIN-TCM",
  "accounting & tax": "FRM-FIN-ATM",
};
export const organisationUnitFor = (job: string): string | null => JOB_UNITS[job.replace(/\s+/g, " ").trim().toLowerCase()] ?? null;
