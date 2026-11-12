import ExcelJS from "exceljs";
import type { Money } from "@estrada/domain";

export interface RecapExportRow {
  number: string;
  entity: string;
  paidOn: string;
  description: string;
  nett: Money;
  bank: string;
}

export interface RecapExport {
  title: string;
  groups: { label: string; rows: RecapExportRow[]; total: Money }[];
  byBank: { bank: string; total: Money }[];
  total: Money;
}

const IDR = "#,##0.00;[Red]-#,##0.00";
const num = (m: Money) => Number(m.toFixed(2));

/** Rekap Pembayaran as the screen shows it: one sheet per day or month with subtotals, one per bank asal. */
export async function writePaymentRecap(input: RecapExport): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP Estrada";
  const titled = (name: string) => {
    const ws = wb.addWorksheet(name);
    ws.addRow([input.title]).font = { bold: true, size: 13 };
    ws.addRow([`Rupiah penuh, nominal nett · diekspor dari ERP Estrada ${new Date().toISOString().slice(0, 10)}`]).font = { italic: true, color: { argb: "FF666666" } };
    ws.addRow([]);
    return ws;
  };
  const header = (ws: ExcelJS.Worksheet, cells: string[]) => {
    const row = ws.addRow(cells);
    row.font = { bold: true };
    row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } }));
    ws.views = [{ state: "frozen", ySplit: row.number }];
  };

  const ws = titled("Rekap Pembayaran");
  header(ws, ["Tanggal bayar", "Nomor", "Deskripsi", "Entitas", "Bank asal", "Nominal (nett)"]);
  for (const g of input.groups) {
    const sub = ws.addRow([g.label, null, null, null, null, num(g.total)]);
    sub.font = { bold: true };
    for (const r of g.rows) ws.addRow([r.paidOn, r.number, r.description, r.entity, r.bank, num(r.nett)]);
  }
  ws.addRow(["Total", null, null, null, null, num(input.total)]).font = { bold: true };
  [16, 26, 48, 11, 26, 20].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.getColumn(6).numFmt = IDR;

  const banks = titled("Per Bank");
  header(banks, ["Bank asal", "Nominal (nett)"]);
  for (const b of input.byBank) banks.addRow([b.bank, num(b.total)]);
  banks.getColumn(1).width = 32;
  Object.assign(banks.getColumn(2), { width: 20, numFmt: IDR });

  return wb.xlsx.writeBuffer();
}
