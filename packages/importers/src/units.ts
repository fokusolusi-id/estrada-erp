import type { Category } from "@estrada/domain";

export interface UnitAlias {
  code: string;
  aliases: readonly string[];
}

/** Resolves a unit as the workbook writes it (CBD, SPA, Sales) to its org unit code. */
export function unitResolver(units: readonly UnitAlias[]): (name: string) => string | null {
  const map = new Map<string, string>();
  for (const u of units) {
    map.set(u.code.toUpperCase(), u.code);
    for (const a of u.aliases) map.set(a.toUpperCase(), u.code);
  }
  return (name) => map.get(name.trim().toUpperCase()) ?? null;
}

const CATEGORIES: Record<string, Category> = { REVENUE: "Revenue", COGS: "COGS", OPEX: "OPEX", OTHERS: "OTHERS", CAPEX: "CAPEX" };

export function category(name: string): Category | null {
  return CATEGORIES[name.trim().toUpperCase()] ?? null;
}

export const centerOf = (c: Category): "revenue" | "cost" => (c === "Revenue" ? "revenue" : "cost");
