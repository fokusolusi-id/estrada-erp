import ExcelJS from "exceljs";
import type { Money } from "@estrada/domain";

export interface ExportSheet {
  name: string;
  columns: string[];
  /** Money cells become numbers with two decimals. */
  rows: (string | Money)[][];
}

/** Plain lists, one sheet each: the tax lists (DJP's upload format is not in the sheets) and the profit and loss. */
export async function writeSheets(title: string, sheets: readonly ExportSheet[], extra?: { header: readonly string[]; watermark: string }): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP Estrada";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.addRow([title]).font = { bold: true, size: 13 };
    ws.addRow([`Rupiah penuh · diekspor dari ERP Estrada ${new Date().toISOString().slice(0, 10)}`]).font = { italic: true, color: { argb: "FF666666" } };
    for (const line of extra?.header ?? []) ws.addRow([line]).font = { color: { argb: "FF666666" } };
    // Printed on every page: Excel has no background watermark.
    if (extra) ws.headerFooter.oddHeader = `&C&24&KC0C0C0${extra.watermark.replace(/&/g, "&&")}`;
    ws.addRow([]);
    const head = ws.addRow(s.columns);
    head.font = { bold: true };
    head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } }));
    ws.views = [{ state: "frozen", ySplit: head.number }];
    for (const row of s.rows) {
      const added = ws.addRow(row.map((v) => (typeof v === "string" ? v : Number(v.toFixed(2)))));
      row.forEach((v, i) => {
        if (typeof v !== "string") added.getCell(i + 1).numFmt = "#,##0.00;[Red]-#,##0.00";
      });
    }
    s.columns.forEach((c, i) => (ws.getColumn(i + 1).width = Math.max(18, c.length + 4)));
  }
  return wb.xlsx.writeBuffer();
}
