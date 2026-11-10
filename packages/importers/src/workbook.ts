import ExcelJS from "exceljs";
import type { Money } from "@estrada/domain";
import { amount, header, text, type Cell } from "./cells";
import { parseCoaMaster, type CoaReference, type ImportedCoa } from "./coa-master";
import { parseCash, type ImportedCash } from "./cash";
import { parsePipeline, type ImportedDeal } from "./pipeline";
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
  /** The Pipeline sheet, when the workbook has one. */
  pipeline: { deals: ImportedDeal[]; targets: { segment: string; target: Money }[]; problems: ImportProblem[] } | null;
  /** Forecast CF Bulanan, the per-entity CF sheets and Obligo Pinjaman Bank, when the workbook has them. */
  cash: ImportedCash | null;
}

/** Reads a division sheet's own "Total RKA YYYY" by sheet name and 1-based row, as "Baris Sumber" counts them. */
function sourceTotals(wb: ExcelJS.Workbook): SourceTotal {
  const cache = new Map<string, { rows: Cell[][]; col: number } | null>();
  return (sheet, row) => {
    if (!cache.has(sheet)) {
      const ws = wb.getWorksheet(sheet);
      if (!ws) cache.set(sheet, null);
      else {
        const rows = sheetRows(wb, sheet);
        try {
          const head = rows.find((r) => r.some((c) => text(c) === "COA Code")) ?? [];
          const name = head.map(text).find((c) => /^Total RKA \d{4}$/.test(c));
          cache.set(sheet, name ? { rows, col: header(rows, ["COA Code", name]).col(name) } : null);
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
  const all = [...accounts, ...provisionalAccounts(lines, accounts)];
  const pipeline = wb.getWorksheet("Pipeline") ? parsePipeline(sheetRows(wb, "Pipeline"), all) : null;
  const cashSheet = wb.worksheets.find((w) => /^Forecast CF Bulanan \d{4}$/.test(w.name));
  const cash = cashSheet
    ? parseCash(
        {
          consolidated: sheetRows(wb, cashSheet.name),
          entities: wb.worksheets
            .filter((w) => w.name.startsWith(`CF ${cashSheet.name.slice(-4)} `))
            .map((w) => [w.name.slice(8).toUpperCase(), sheetRows(wb, w.name)] as [string, Cell[][]]),
          obligo: wb.getWorksheet("Obligo Pinjaman Bank") ? sheetRows(wb, "Obligo Pinjaman Bank") : null,
        },
        all,
      )
    : null;
  return { accounts: all, references, lines, problems, pipeline, cash };
}
