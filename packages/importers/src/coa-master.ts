import type { Category, Money } from "@estrada/domain";
import { amount, header, text, type Cell } from "./cells";
import { category, centerOf, unitResolver, type UnitAlias } from "./units";

export interface ImportedCoa {
  code: string;
  name: string;
  category: Category;
  center: "revenue" | "cost";
  defaultOwnerUnit: string | null;
  active: boolean;
  guidance: string | null;
  examples: string | null;
  provisional?: true;
}

/** COA Master's per-entity-group figures for 2026 (one code appears once per group). */
export interface CoaReference {
  code: string;
  entityGroup: string;
  rka2026: Money | null;
  actualYtd: Money | null;
  forecastQ4: Money | null;
}

const COLS = ["COA Code", "COA Name", "Category", "Budget Owner", "Project Code", "RKA 2026", "Actual 2026 YtD Sept 26", "Forecast Q4 (Okt-Des 2026)", "Status", "Description / Guidance", "Transaction Examples"] as const;

/** Sheet "COA MASTER": one account per code, plus each entity group's 2026 figures. */
export function parseCoaMaster(rows: Cell[][], units: readonly UnitAlias[]): { accounts: ImportedCoa[]; references: CoaReference[] } {
  const h = header(rows, COLS);
  const unit = unitResolver(units);
  const accounts = new Map<string, ImportedCoa>();
  const references: CoaReference[] = [];

  for (const r of rows.slice(h.row + 1)) {
    const code = text(r[h.col("COA Code")]);
    if (!code) continue;
    const cat = category(text(r[h.col("Category")]));
    if (!cat) throw new Error(`COA ${code}: unknown category "${text(r[h.col("Category")])}"`);
    if (!accounts.has(code)) {
      accounts.set(code, {
        code,
        name: text(r[h.col("COA Name")]),
        category: cat,
        center: centerOf(cat),
        defaultOwnerUnit: unit(text(r[h.col("Budget Owner")])),
        active: text(r[h.col("Status")]).toLowerCase() !== "inactive",
        guidance: text(r[h.col("Description / Guidance")]) || null,
        examples: text(r[h.col("Transaction Examples")]) || null,
      });
    }
    references.push({
      code,
      entityGroup: text(r[h.col("Project Code")]),
      rka2026: amount(r[h.col("RKA 2026")]),
      actualYtd: amount(r[h.col("Actual 2026 YtD Sept 26")]),
      forecastQ4: amount(r[h.col("Forecast Q4 (Okt-Des 2026)")]),
    });
  }
  return { accounts: [...accounts.values()], references };
}
