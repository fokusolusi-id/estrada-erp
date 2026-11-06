import ExcelJS from "exceljs";
import { amount, header, type Cell } from "./cells";
import { parseCoaMaster, type CoaReference, type ImportedCoa } from "./coa-master";
import { parseRkaData, provisionalAccounts, type ImportedLine, type ImportProblem, type SourceTotal } from "./rka-data";
import type { UnitAlias } from "./units";

/** A cell as Excel stored it, with formulas read from their cached result (the workbook is not recalculated). */
function cellOf(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean" || v instanceof Date) return v;
  if ("result" in v) return cellOf(v.result as ExcelJS.CellValue);
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("text" in v) return String(v.text);
  if ("error" in v) return null;
  return null;
}

export function sheetRows(wb: ExcelJS.Workbook, name: string): Cell[][] {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`Sheet "${name}" not found`);
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const values = row.values as ExcelJS.CellValue[];
    rows[n - 1] = values.slice(1).map(cellOf);
  });
  return Array.from(rows, (r) => r ?? []);
}

export interface RkaWorkbook {
  /** COA Master accounts, then provisional accounts for codes only the lines use. */
  accounts: ImportedCoa[];
  references: CoaReference[];
  lines: ImportedLine[];
  problems: ImportProblem[];
}

/** Reads a division sheet's own "Total RKA 2027" by sheet name and 1-based row, as "Baris Sumber" counts them. */
function sourceTotals(wb: ExcelJS.Workbook): SourceTotal {
  const cache = new Map<string, { rows: Cell[][]; col: number } | null>();
  return (sheet, row) => {
    if (!cache.has(sheet)) {
      const ws = wb.getWorksheet(sheet);
      if (!ws) cache.set(sheet, null);
      else {
        const rows = sheetRows(wb, sheet);
        try {
          cache.set(sheet, { rows, col: header(rows, ["COA Code", "Total RKA 2027"]).col("Total RKA 2027") });
        } catch {
          cache.set(sheet, null);
        }
      }
    }
    const s = cache.get(sheet);
    return s ? amount(s.rows[row - 1]?.[s.col] ?? null) : null;
  };
}

/** Reads RKA_2027_Upd_Fin-style workbooks: "COA MASTER" for the chart of accounts, "RKA 2027 Data" for the lines. */
export async function readRkaWorkbook(path: string, units: readonly UnitAlias[]): Promise<RkaWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const { accounts, references } = parseCoaMaster(sheetRows(wb, "COA MASTER"), units);
  const { lines, problems } = parseRkaData(sheetRows(wb, "RKA 2027 Data"), units, sourceTotals(wb));
  return { accounts: [...accounts, ...provisionalAccounts(lines, accounts)], references, lines, problems };
}
