import ExcelJS from "exceljs";
import { contribution, pnl, sum, type Category, type Money, type PnlKey } from "@estrada/domain";
import { MONTHS, RKA_DATA_COLUMNS } from "./rka-data";

export interface ExportLine {
  coaCode: string;
  coaName: string;
  category: Category;
  requestorUnit: string;
  ownerUnit: string;
  entity: string;
  item: string | null;
  months: Money[];
  rka2026: Money | null;
  actual2026: Money | null;
  basis: string | null;
  notes: string | null;
  flags: string[];
  /** The approval state as the team reads it, e.g. "Terkunci". */
  status: string;
  sourceRef: string | null;
}

export interface ExportInput {
  year: number;
  /** The version name, printed on every sheet. */
  title: string;
  lines: readonly ExportLine[];
  /** Division name for a unit, used for Divisi columns and Kontribusi Divisi. */
  divisionOf: (unit: string) => string;
  pnlLabel: Record<PnlKey, string>;
}

const CATEGORY_CELL: Record<Category, string> = { Revenue: "REVENUE", COGS: "COGS", OPEX: "OPEX", OTHERS: "OTHERS", CAPEX: "CAPEX" };
const IDR = "#,##0.00;[Red]-#,##0.00";

/**
 * Excel is the hand-off format, not the source of truth: Decimal amounts become cell numbers here only.
 * Rupiah up to hundreds of billions with cents are within a double's 15 significant digits.
 */
const num = (m: Money | null) => (m ? Number(m.toFixed(2)) : null);

/**
 * The RKA as Finance's workbook lays it out. "RKA {year} Data" uses the importer's own columns, so an export
 * reads back line for line; Rekap, Kontribusi Divisi and Per Entitas come from the same lines as the screens.
 */
export async function writeRkaWorkbook(input: ExportInput): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP Estrada";
  const { lines, divisionOf } = input;
  const titled = (name: string, title: string) => {
    const ws = wb.addWorksheet(name);
    ws.addRow([`${title} – ${input.title}`]).font = { bold: true, size: 13 };
    ws.addRow([`Rupiah penuh · diekspor dari ERP Estrada ${new Date().toISOString().slice(0, 10)}`]).font = { italic: true, color: { argb: "FF666666" } };
    ws.addRow([]);
    return ws;
  };
  const headerRow = (ws: ExcelJS.Worksheet, cells: readonly string[]) => {
    const row = ws.addRow([...cells]);
    row.font = { bold: true };
    row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } }));
    ws.views = [{ state: "frozen", ySplit: row.number }];
    return row;
  };

  // Lines, in the importer's layout plus the approval status and where each line came from.
  const data = titled(`RKA ${input.year} Data`, `RKA ${input.year} – Data`);
  const cols = [...RKA_DATA_COLUMNS, "Status", "Sumber"];
  headerRow(data, cols);
  const at = (name: string) => cols.indexOf(name) + 1;
  const first = data.getColumn(at(MONTHS[0])).letter;
  const last = data.getColumn(at(MONTHS[11])).letter;
  lines.forEach((l, i) => {
    const values: Record<string, ExcelJS.CellValue> = {
      No: i + 1,
      "Sumber Sheet": "ERP Estrada",
      "COA Code": l.coaCode,
      "COA Name": l.coaName,
      Category: CATEGORY_CELL[l.category],
      "Requestor (Unit)": l.requestorUnit,
      "Divisi Requestor": divisionOf(l.requestorUnit),
      "Budget Owner (Unit)": l.ownerUnit,
      "Divisi Budget Owner": divisionOf(l.ownerUnit),
      "Lintas Divisi": divisionOf(l.requestorUnit) === divisionOf(l.ownerUnit) ? "Tidak" : "Ya",
      Entitas: l.entity,
      "Keterangan / Item": l.item,
      "RKA 2026": num(l.rka2026),
      "Actual 2026": num(l.actual2026),
      ...Object.fromEntries(MONTHS.map((m, k) => [m, num(l.months[k] ?? null) ?? 0])),
      "Basis / Assumption": l.basis,
      Notes: l.notes,
      "Flag Cleaning": l.flags.join("; ") || null,
      Status: l.status,
      Sumber: l.sourceRef,
    };
    const row = data.addRow(cols.map((c) => values[c] ?? null));
    row.getCell(at("Total RKA 2027")).value = { formula: `SUM(${first}${row.number}:${last}${row.number})`, result: num(sum(l.months)) ?? 0 };
  });
  for (const name of ["RKA 2026", "Actual 2026", ...MONTHS, "Total RKA 2027"]) data.getColumn(at(name)).numFmt = IDR;
  data.columns.forEach((c, i) => (c.width = i + 1 >= at(MONTHS[0]) && i + 1 <= at("Total RKA 2027") ? 18 : 14));
  data.getColumn(at("Keterangan / Item")).width = 36;

  // Rekap: the Management Summary's P&L by month.
  const rekap = titled("Rekap", `Rekap RKA ${input.year}`);
  headerRow(rekap, ["Uraian", ...MONTHS, "Total"]);
  for (const r of pnl(lines)) {
    const row = rekap.addRow([input.pnlLabel[r.key], ...r.months.map(num), num(r.total)]);
    if (r.derived) row.font = { bold: true };
  }
  rekap.getColumn(1).width = 24;
  for (let c = 2; c <= 14; c++) Object.assign(rekap.getColumn(c), { width: 18, numFmt: IDR });

  // Contribution tables, with a closing total.
  const contributionSheet = (name: string, label: string, keyOf: (l: ExportLine) => string) => {
    const ws = titled(name, name);
    headerRow(ws, [label, "Pendapatan", "Total Biaya", "Kontribusi", "Baris"]);
    const rows = contribution(lines, keyOf);
    for (const c of rows) ws.addRow([c.key, num(c.revenue), num(c.cost), num(c.net), c.lines]);
    const total = (pick: (c: (typeof rows)[number]) => Money) => num(sum(rows.map(pick)));
    ws.addRow(["Total", total((c) => c.revenue), total((c) => c.cost), total((c) => c.net), lines.length]).font = { bold: true };
    ws.getColumn(1).width = 30;
    for (let c = 2; c <= 4; c++) Object.assign(ws.getColumn(c), { width: 20, numFmt: IDR });
  };
  contributionSheet("Kontribusi Divisi", "Divisi pengusul", (l) => divisionOf(l.requestorUnit));
  contributionSheet("Per Entitas", "Entitas", (l) => l.entity);

  return wb.xlsx.writeBuffer();
}
