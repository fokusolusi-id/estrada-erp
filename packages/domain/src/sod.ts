/** Segregation of Duties (sheet 05_SoD_Matrix, BR-NFR-003): the functions that must never meet in one person on one record. */
import type { Role } from "./roles";

export const SOD_FUNCTIONS = [
  "BOD",
  "Direktur PT",
  "Head BusDev",
  "Sales",
  "PM",
  "SCM",
  "OPS",
  "Finance-Pricing",
  "Finance-CashMgmt",
  "Finance-AR/Tax",
  "Accounting",
  "Audit/Controller",
  "Data Steward MD",
  "IT Admin",
] as const;
export type SodFunction = (typeof SOD_FUNCTIONS)[number];

/** The cells marked X (WAJIB DIPISAH). "R" and "O" cells are allowed. */
export const SOD_FORBIDDEN: readonly (readonly [SodFunction, SodFunction])[] = [
  ["Head BusDev", "Sales"],
  ["PM", "SCM"],
  ["PM", "Finance-CashMgmt"],
  ["PM", "Finance-AR/Tax"],
  ["SCM", "Finance-CashMgmt"],
  ["SCM", "Finance-AR/Tax"],
  ["Finance-Pricing", "Finance-CashMgmt"],
  ["Finance-Pricing", "Finance-AR/Tax"],
  ["Finance-Pricing", "Accounting"],
  ["Finance-CashMgmt", "Finance-AR/Tax"],
  ["Finance-CashMgmt", "Accounting"],
  ["Finance-AR/Tax", "Accounting"],
  ["Audit/Controller", "Data Steward MD"],
];

const BY_ROLE: Partial<Record<Role, readonly SodFunction[]>> = {
  director: ["BOD", "Direktur PT"],
  auditor: ["Audit/Controller"],
  finance: ["Finance-Pricing"],
  bfp: ["Finance-Pricing"],
  cash_manager: ["Finance-CashMgmt"],
  admin: ["IT Admin"],
};

const within = (unit: string, root: string) => unit === root || unit.startsWith(`${root}-`);

/** What a seat counts as in the matrix: by its role where that says it, else by its unit. */
export function sodFunctions(role: Role, unit: string | null): SodFunction[] {
  const byRole = BY_ROLE[role];
  if (byRole) return [...byRole];
  if (!unit) return [];
  if (within(unit, "BCD")) return [role === "division_owner" ? "Head BusDev" : "Sales"];
  if (within(unit, "PMO")) return ["PM"];
  if (within(unit, "SCM")) return ["SCM"];
  if (within(unit, "MSO") || within(unit, "ISO")) return ["OPS"];
  if (within(unit, "FRM-FIN-ATM")) return ["Finance-AR/Tax", "Accounting"];
  return [];
}

export interface SodStep {
  userId: string;
  functions: readonly SodFunction[];
}

const forbidden = (a: SodFunction, b: SodFunction) => SOD_FORBIDDEN.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** The conflict a step would create with what the same person already did on the record, or null. */
export function sodConflict(now: SodStep, history: readonly SodStep[]): { did: SodFunction; now: SodFunction } | null {
  for (const past of history) {
    // The same seat twice is one duty, even where that seat carries two functions.
    if (past.userId !== now.userId || [...past.functions].sort().join() === [...now.functions].sort().join()) continue;
    for (const did of past.functions) for (const f of now.functions) if (forbidden(did, f)) return { did, now: f };
  }
  return null;
}
