import { describe, expect, it } from "vitest";
import { parseCoaMaster, parseRkaData, provisionalAccounts, type Cell } from "../src/index";

const UNITS = [
  { code: "FRM", aliases: [] },
  { code: "HCM", aliases: [] },
  { code: "SCM", aliases: [] },
  { code: "BCD", aliases: ["CBD", "SPA", "Sales"] },
];

// COA MASTER as the workbook lays it out: title rows, header on row 3, one row per entity group.
const COA: Cell[][] = [
  ["COA MASTER – RKA 2027"],
  [],
  ["COA Code", "COA Name", "Category", "Budget Owner", "Division Owner", "Project Code", "RKA 2026", "ACTUAL & FORECAST", "Actual 2026 YtD Sept 26", "Forecast Q4 (Okt-Des 2026)", "DEVIASI", "%", "Status", "Description / Guidance", "Transaction Examples", "Center (COA Merah)"],
  [4100, "Pendapatan Sewa CPE", "Revenue", "Sales", "Bussiness Comercial Division", "Indirect (Estrada)", 227700000000, 191253464482, 191253464482, null, 0, 0, "Active", "Pendapatan Gross Estrada", "Penyewaan router", "Revenue Center"],
  ["5300", "Biaya jaringan Internet", "COGS", "SCM", "Project Delivery & Managed Services", "Indirect (Estrada)", 1000, 900, 600, 300, 0, 0, "Active", null, null, "Cost Center"],
  ["5300", "Biaya jaringan Internet", "COGS", "SCM", "Project Delivery & Managed Services", "Direct (Matrik)", 500, 400, 100, 300, 0, 0, "Active", null, null, null],
];

const HEADER: Cell[] = ["No", "Sumber Sheet", "Baris Sumber", "COA Code", "COA Name", "Category", "Requestor (Unit)", "Divisi Requestor", "Budget Owner (Unit)", "Divisi Budget Owner", "Lintas Divisi", "Entitas", "Dasar Entitas", "Keterangan / Item", "Qty (Org)", "RKA 2026", "Actual 2026", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Total RKA 2027", "Basis / Assumption", "Notes", "Flag Cleaning"];
const months = (v: number) => Array.from({ length: 12 }, () => v);
const dataRow = (over: Partial<Record<string, Cell>>, m: Cell[] = months(1000)): Cell[] => {
  const base: Record<string, Cell> = { No: 1, "Sumber Sheet": "Project Delivery & Managed Serv", "Baris Sumber": 20, "COA Code": "5300", "COA Name": "Biaya jaringan Internet", Category: "COGS", "Requestor (Unit)": "SCM", "Budget Owner (Unit)": "SCM", "Lintas Divisi": "Tidak", Entitas: "ESTRADA", "Keterangan / Item": "Bandwidth pelanggan", "RKA 2026": 4000000, "Actual 2026": 3500000.5, "Basis / Assumption": "Tarif berjalan", ...over };
  return HEADER.map((h, i) => (i >= 17 && i <= 28 ? m[i - 17]! : (base[String(h)] ?? null)));
};
const DATA = (rows: Cell[][]): Cell[][] => [["RKA 2027 – DATA BERSIH"], ["Nominal Jan–Des di-link"], [], HEADER, ...rows];

describe("parseCoaMaster", () => {
  const { accounts, references } = parseCoaMaster(COA, UNITS);

  it("keeps one account per code, with the owner unit resolved through aliases", () => {
    expect(accounts).toEqual([
      { code: "4100", name: "Pendapatan Sewa CPE", category: "Revenue", center: "revenue", defaultOwnerUnit: "BCD", active: true, guidance: "Pendapatan Gross Estrada", examples: "Penyewaan router" },
      { code: "5300", name: "Biaya jaringan Internet", category: "COGS", center: "cost", defaultOwnerUnit: "SCM", active: true, guidance: null, examples: null },
    ]);
  });

  it("keeps each entity group's 2026 figures as reference rows", () => {
    expect(references.filter((r) => r.code === "5300").map((r) => [r.entityGroup, r.rka2026?.toString(), r.actualYtd?.toString(), r.forecastQ4?.toString()])).toEqual([
      ["Indirect (Estrada)", "1000", "600", "300"],
      ["Direct (Matrik)", "500", "100", "300"],
    ]);
  });
});

describe("parseRkaData", () => {
  it("reads a line with its months, 2026 context and basis", () => {
    const { lines, problems } = parseRkaData(DATA([dataRow({}, months(390686823.67))]), UNITS);
    expect(problems).toEqual([]);
    const l = lines[0]!;
    expect(l).toMatchObject({ ref: { no: 1, sheet: "Project Delivery & Managed Serv", row: 20 }, coaCode: "5300", category: "COGS", requestorUnit: "SCM", ownerUnit: "SCM", crossDivision: false, entity: "ESTRADA", item: "Bandwidth pelanggan", basis: "Tarif berjalan", flags: [] });
    expect(l.months.map((m) => m.toString())).toEqual(months(390686823.67).map(String));
    expect(l.rka2026?.toString()).toBe("4000000");
    expect(l.actual2026?.toString()).toBe("3500000.5");
  });

  it("maps old unit names, the upper-case category and Lintas Divisi", () => {
    const { lines } = parseRkaData(DATA([dataRow({ "Requestor (Unit)": "FRM", "Budget Owner (Unit)": "CBD", Category: "REVENUE", "Lintas Divisi": "Ya" })]), UNITS);
    expect(lines[0]).toMatchObject({ requestorUnit: "FRM", ownerUnit: "BCD", category: "Revenue", crossDivision: true });
  });

  it("keeps the workbook's cleaning flags and blank 2026 figures as null", () => {
    const { lines } = parseRkaData(DATA([dataRow({ "Flag Cleaning": "Cek potensi double counting dengan RKA HCM; Nilai bulanan mengandung desimal", "RKA 2026": null, "Actual 2026": null })]), UNITS);
    expect(lines[0]!.flags).toEqual(["Cek potensi double counting dengan RKA HCM", "Nilai bulanan mengandung desimal"]);
    expect(lines[0]!.rka2026).toBeNull();
  });

  it("keeps headcount in the notes instead of a cost column", () => {
    const { lines } = parseRkaData(DATA([dataRow({ "Qty (Org)": 3, Notes: "Rekrutmen" })]), UNITS);
    expect(lines[0]!.notes).toBe("Rekrutmen · Qty 3 org");
  });

  it("rounds Excel float noise to the rupiah cent", () => {
    const { lines } = parseRkaData(DATA([dataRow({}, months(0.1 + 0.2))]), UNITS);
    expect(lines[0]!.months[0]!.toString()).toBe("0.3");
  });

  it("reports rows it cannot place instead of guessing", () => {
    const { lines, problems } = parseRkaData(DATA([dataRow({ No: 7, "Requestor (Unit)": "XYZ" }), dataRow({ No: 8, Entitas: "" })]), UNITS);
    expect(lines).toEqual([]);
    expect(problems).toEqual([
      { no: 7, message: "Unit pengusul tidak dikenal: XYZ" },
      { no: 8, message: "Entitas kosong" },
    ]);
  });

  it("flags a typed total that the months do not add up to", () => {
    const row = dataRow({ "Total RKA 2027": 45000000 }, months(0));
    expect(parseRkaData(DATA([row]), UNITS).lines[0]!.flags).toEqual(["Total diketik Rp 45.000.000 tidak sama dengan jumlah bulan"]);
  });
});

describe("provisionalAccounts", () => {
  it("adds codes used on lines but missing from COA Master, marked for Finance to decide", () => {
    const { accounts } = parseCoaMaster(COA, UNITS);
    const { lines } = parseRkaData(DATA([dataRow({ "COA Code": "4300", "COA Name": "Pendapatan Harwat Smart City", Category: "REVENUE", "Budget Owner (Unit)": "CBD" }), dataRow({ "COA Code": "4300" })]), UNITS);
    expect(provisionalAccounts(lines, accounts)).toEqual([
      { code: "4300", name: "Pendapatan Harwat Smart City", category: "Revenue", center: "revenue", defaultOwnerUnit: "BCD", active: true, guidance: "Belum ada di COA Master. Perlu keputusan Finance.", examples: null, provisional: true },
    ]);
  });
});
