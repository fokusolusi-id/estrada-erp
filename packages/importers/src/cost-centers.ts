import { FUNCTION_GROUPS, type FunctionGroup } from "@estrada/domain";
import { amount, header, text, type Cell } from "./cells";

export interface ImportedCostCenter {
  code: string;
  name: string;
  functionGroup: FunctionGroup;
  approvalLimit: string;
}

const COLS = ["Cost Center ID", "Divisi", "Function Group", "Approval Limit (Rp)"] as const;

/** Sheet "33_Master_CostCenter": the CC- rows; the reference tables below them are not cost centers. */
export function parseCostCenters(rows: Cell[][]): ImportedCostCenter[] {
  const h = header(rows, COLS);
  const found: ImportedCostCenter[] = [];
  for (const r of rows.slice(h.row + 1)) {
    const get = (c: (typeof COLS)[number]) => text(r[h.col(c)]).replace(/\s+/g, " ").trim();
    const code = get("Cost Center ID");
    if (!/^CC-\d+$/.test(code)) continue;
    const functionGroup = FUNCTION_GROUPS.find((g) => g.toLowerCase() === get("Function Group").toLowerCase());
    if (!functionGroup) throw new Error(`Cost center ${code}: Function Group "${get("Function Group")}" tidak dikenal`);
    const limit = amount(r[h.col("Approval Limit (Rp)")]);
    if (!limit) throw new Error(`Cost center ${code}: Approval Limit tidak terbaca`);
    found.push({ code, name: get("Divisi"), functionGroup, approvalLimit: limit.toFixed(2) });
  }
  return found;
}

/** Sheet "M Organisasi": who sits at which level (1–4), by job. */
export function parseOrganisationLevels(rows: Cell[][]): { name: string; level: number; job: string }[] {
  const h = header(rows, ["Nama", "Level", "Jabatan"]);
  return rows.slice(h.row + 1).flatMap((r) => {
    const name = text(r[h.col("Nama")]).trim();
    if (!name) return [];
    const level = Number(/^Level ([1-4])$/i.exec(text(r[h.col("Level")]).trim())?.[1]);
    if (!level) throw new Error(`M Organisasi ${name}: Level harus "Level 1" sampai "Level 4"`);
    return [{ name, level, job: text(r[h.col("Jabatan")]).replace(/\s+/g, " ").trim() }];
  });
}
