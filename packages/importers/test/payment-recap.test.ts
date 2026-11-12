import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { money } from "@estrada/domain";
import { writePaymentRecap } from "../src/index";

const row = (number: string, paidOn: string, nett: string, bank: string) => ({ number, entity: "ESTRADA", paidOn, description: `Bayar ${number}`, nett: money(nett), bank });

async function exported() {
  const buf = await writePaymentRecap({
    title: "Rekap Pembayaran per hari, 1 November 2026 – 30 November 2026",
    groups: [
      { label: "Selasa, 3 November 2026", rows: [row("PP/1", "2026-11-03", "1000", "BCA 1"), row("PP/2", "2026-11-03", "250.50", "Mandiri 9")], total: money("1250.50") },
      { label: "Minggu, 15 November 2026", rows: [row("PP/3", "2026-11-15", "4000", "BCA 1")], total: money("4000") },
    ],
    byBank: [
      { bank: "BCA 1", total: money("5000") },
      { bank: "Mandiri 9", total: money("250.50") },
    ],
    total: money("5250.50"),
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

const values = (ws: ExcelJS.Worksheet) => {
  const out: unknown[][] = [];
  ws.eachRow((r) => out.push((r.values as unknown[]).slice(1)));
  return out;
};

describe("writePaymentRecap", () => {
  it("lists each payment under its day with a subtotal, then the total", async () => {
    const ws = (await exported()).getWorksheet("Rekap Pembayaran")!;
    const rows = values(ws);
    expect(rows[0]).toEqual(["Rekap Pembayaran per hari, 1 November 2026 – 30 November 2026"]);
    const header = rows.findIndex((r) => r[0] === "Tanggal bayar");
    expect(rows[header]).toEqual(["Tanggal bayar", "Nomor", "Deskripsi", "Entitas", "Bank asal", "Nominal (nett)"]);
    expect(rows.slice(header + 1)).toEqual([
      ["Selasa, 3 November 2026", undefined, undefined, undefined, undefined, 1250.5],
      ["2026-11-03", "PP/1", "Bayar PP/1", "ESTRADA", "BCA 1", 1000],
      ["2026-11-03", "PP/2", "Bayar PP/2", "ESTRADA", "Mandiri 9", 250.5],
      ["Minggu, 15 November 2026", undefined, undefined, undefined, undefined, 4000],
      ["2026-11-15", "PP/3", "Bayar PP/3", "ESTRADA", "BCA 1", 4000],
      ["Total", undefined, undefined, undefined, undefined, 5250.5],
    ]);
  });

  it("totals each bank asal on its own sheet", async () => {
    const ws = (await exported()).getWorksheet("Per Bank")!;
    expect(values(ws).slice(-3)).toEqual([
      ["Bank asal", "Nominal (nett)"],
      ["BCA 1", 5000],
      ["Mandiri 9", 250.5],
    ]);
  });
});
