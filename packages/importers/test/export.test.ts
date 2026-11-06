import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { money, pnl, sum, type Money, type PnlKey } from "@estrada/domain";
import { parseRkaData, sheetRows, writeRkaWorkbook, type ExportLine } from "../src/index";

const UNITS = [
  { code: "FRM", aliases: [] },
  { code: "HCM", aliases: [] },
  { code: "SCM", aliases: [] },
  { code: "BCD", aliases: [] },
];
const DIVISION: Record<string, string> = { FRM: "Finance", HCM: "Human Capital", SCM: "PDMS", BCD: "Business Commercial" };
const PNL_LABEL = { Revenue: "Pendapatan", COGS: "COGS", GrossProfit: "Laba Kotor", OPEX: "OPEX", OperatingProfit: "Laba Operasional", OTHERS: "OTHERS", ProfitBeforeTax: "Laba Sebelum Pajak", CAPEX: "CAPEX", TotalCost: "Total Biaya" } satisfies Record<PnlKey, string>;

const months = (...v: string[]) => Array.from({ length: 12 }, (_, i) => money(v[i % v.length]!));
const LINES: ExportLine[] = [
  { coaCode: "4100", coaName: "Pendapatan Sewa CPE", category: "Revenue", requestorUnit: "BCD", ownerUnit: "BCD", entity: "ESTRADA", item: "Sewa router", months: months("1000000000.50"), rka2026: money("9000000000"), actual2026: null, basis: "Kontrak berjalan", notes: null, flags: [], status: "Terkunci", sourceRef: "RKA 2027 Data #1" },
  { coaCode: "4100", coaName: "Pendapatan Sewa CPE", category: "Revenue", requestorUnit: "BCD", ownerUnit: "BCD", entity: "MATRIK", item: null, months: months("250000000"), rka2026: null, actual2026: null, basis: null, notes: null, flags: [], status: "Terkunci", sourceRef: null },
  { coaCode: "5300", coaName: "Biaya jaringan Internet", category: "COGS", requestorUnit: "SCM", ownerUnit: "SCM", entity: "ESTRADA", item: "Bandwidth", months: months("300000000.33", "0"), rka2026: money("3500000000"), actual2026: money("2999999999.99"), basis: null, notes: "Qty 3 org", flags: ["Nominal Q4 diasumsikan", "Cek tarif"], status: "Review Finance", sourceRef: null },
  { coaCode: "6222", coaName: "Biaya pelatihan", category: "OPEX", requestorUnit: "FRM", ownerUnit: "HCM", entity: "ESTRADA", item: "Sertifikasi", months: months("15000000"), rka2026: null, actual2026: null, basis: null, notes: null, flags: [], status: "Draft", sourceRef: null },
];

async function exported(lines = LINES) {
  const buf = await writeRkaWorkbook({ year: 2027, title: "RKA 2027 v2", lines, divisionOf: (u) => DIVISION[u]!, pnlLabel: PNL_LABEL });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}
const totalOf = (l: { months: Money[] }) => sum(l.months).toFixed(2);

describe("writeRkaWorkbook", () => {
  it("writes RKA 2027 Data in the importer's own layout, so the export reads back line for line", async () => {
    const wb = await exported();
    const { lines, problems } = parseRkaData(sheetRows(wb, "RKA 2027 Data"), UNITS);
    expect(problems).toEqual([]);
    expect(lines.map((l) => [l.coaCode, l.requestorUnit, l.ownerUnit, l.entity, l.category, l.item, totalOf(l)])).toEqual(
      LINES.map((l) => [l.coaCode, l.requestorUnit, l.ownerUnit, l.entity, l.category, l.item, totalOf(l)]),
    );
    expect(lines[2]!.months.map((m) => m.toFixed(2))).toEqual(LINES[2]!.months.map((m) => m.toFixed(2)));
    expect([lines[2]!.rka2026?.toFixed(2), lines[2]!.actual2026?.toFixed(2), lines[1]!.rka2026]).toEqual(["3500000000.00", "2999999999.99", null]);
    expect(lines[2]!.flags).toEqual(["Nominal Q4 diasumsikan", "Cek tarif"]);
    expect(lines.map((l) => l.crossDivision)).toEqual([false, false, false, true]);
  });

  it("keeps each line's total as a live SUM over its months", async () => {
    const ws = (await exported()).getWorksheet("RKA 2027 Data")!;
    const header = (ws.getRow(4).values as ExcelJS.CellValue[]).map(String);
    const total = ws.getRow(5).getCell(header.indexOf("Total RKA 2027")).value as ExcelJS.CellFormulaValue;
    expect(total.formula).toMatch(/^SUM\([A-Z]+5:[A-Z]+5\)$/);
    expect(total.result).toBe(12000000006);
  });

  it("writes Rekap from the same lines as the Management Summary", async () => {
    const rows = sheetRows(await exported(), "Rekap");
    const expected = pnl(LINES);
    const find = (label: string) => rows.find((r) => r[0] === label)!;
    for (const r of expected) {
      const row = find(PNL_LABEL[r.key]);
      expect(money(String(row[13])).toFixed(2)).toBe(r.total.toFixed(2));
      expect(money(String(row[1])).toFixed(2)).toBe(r.months[0]!.toFixed(2));
    }
  });

  it("writes Kontribusi Divisi per requestor division, and Per Entitas", async () => {
    const wb = await exported();
    const div = sheetRows(wb, "Kontribusi Divisi").filter((r) => typeof r[2] === "number");
    expect(div.map((r) => [r[0], r[1], r[2], r[3]])).toEqual([
      ["Business Commercial", 15000000006, 0, 15000000006],
      ["PDMS", 0, 1800000001.98, -1800000001.98],
      ["Finance", 0, 180000000, -180000000],
      ["Total", 15000000006, 1980000001.98, 13020000004.02],
    ]);
    const ent = sheetRows(wb, "Per Entitas").filter((r) => typeof r[2] === "number");
    expect(ent.map((r) => r[0])).toEqual(["ESTRADA", "MATRIK", "Total"]);
  });

  it("writes Per Entitas after shared-cost allocation when the screen has one", async () => {
    const allocation = [
      { key: "ESTRADA", revenue: money("120"), costBefore: money("100"), allocated: money("-40"), costAfter: money("60"), netAfter: money("60") },
      { key: "MATRIK", revenue: money("30"), costBefore: money("0"), allocated: money("40"), costAfter: money("40"), netAfter: money("-10") },
    ];
    const buf = await writeRkaWorkbook({ year: 2027, title: "RKA 2027 v2", lines: LINES, divisionOf: (u) => DIVISION[u]!, pnlLabel: PNL_LABEL, entityAllocation: allocation });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const rows = sheetRows(wb, "Per Entitas");
    expect(rows.find((r) => r[0] === "Entitas")).toEqual(["Entitas", "Pendapatan", "Biaya sendiri", "Alokasi biaya bersama", "Total Biaya", "Kontribusi"]);
    expect(rows.filter((r) => typeof r[2] === "number")).toEqual([
      ["ESTRADA", 120, 100, -40, 60, 60],
      ["MATRIK", 30, 0, 40, 40, -10],
      ["Total", 150, 100, 0, 100, 50],
    ]);
  });

  it("names the version on every sheet and states the unit is full rupiah", async () => {
    const wb = await exported();
    for (const name of ["Rekap", "Kontribusi Divisi", "Per Entitas"]) {
      expect(String(sheetRows(wb, name)[0]![0])).toContain("RKA 2027 v2");
    }
    expect(String(sheetRows(wb, "Rekap")[1]![0])).toMatch(/Rupiah penuh/);
  });

  it("writes a workbook with only the header when nothing is in scope", async () => {
    const { lines } = parseRkaData(sheetRows(await exported([]), "RKA 2027 Data"), UNITS);
    expect(lines).toEqual([]);
  });
});
