import { describe, expect, it } from "vitest";
import { parsePipeline, type Cell } from "../src/index";

const HEADER: Cell[] = ["No", "Perusahaan/Entitas", "Customer", "End Customer", "Segmen", "Project Name", "COA", "Project Value (Exclude PPN)", "Status", "Probabilitas (%)", "Type Project", "Start", "End", null, null, "Note :", "Status", "Probabilitas", null, "SEGMEN", "Target Revenue/Pendapatan"];
const row = (over: Partial<Record<string, Cell>> = {}): Cell[] => {
  const base: Record<string, Cell> = {
    No: 1,
    "Perusahaan/Entitas": "ESTRADA",
    Customer: "Telkom",
    "End Customer": "Korlantas",
    Segmen: "Telco Business",
    "Project Name": "Sewa CPE SBST Online Korlantas Polri TA 2027",
    COA: "Pendapatan Sewa CPE",
    "Project Value (Exclude PPN)": 577320000,
    Status: "WB",
    "Probabilitas (%)": 0.9,
    "Type Project": "Renewal",
    Start: "Jan",
    End: "Des",
    ...over,
  };
  return HEADER.map((h, i) => (i < 13 ? base[h as string] ?? null : null));
};
const SHEET = (rows: Cell[][], legend: Cell[][] = []): Cell[][] => [
  [null],
  HEADER,
  ...rows.map((r, i) => {
    const l = legend[i];
    return l ? [...r.slice(0, 19), ...l] : r;
  }),
];
const COA = [
  { code: "4100", name: "Pendapatan Sewa CPE (Router Gateway)" },
  { code: "4200", name: "Pendapatan Harwat Smart City" },
  { code: "4300", name: "Pendapatan Harwat Smart City", provisional: true as const },
];

describe("parsePipeline: the Pipeline sheet", () => {
  it("reads a deal with probability as a percent, months by name and COA by its master name", () => {
    const { deals, problems } = parsePipeline(SHEET([row()]), COA);
    expect(problems).toEqual([]);
    expect(deals).toEqual([
      {
        ref: { no: 1 },
        entity: "ESTRADA",
        customer: "Telkom",
        endCustomer: "Korlantas",
        segment: "Telco Business",
        project: "Sewa CPE SBST Online Korlantas Polri TA 2027",
        coaCode: "4100",
        value: "577320000",
        status: "WB",
        probability: "90",
        type: "renewal",
        startMonth: 1,
        endMonth: 12,
        notes: null,
        leadTimeMonths: null,
      },
    ]);
  });

  // Kontrol RKA, titik sambung 1 and 6: these load, with a warning, and are fixed in the app.
  it("warns about a deal without a recognised COA and about a project name repeated within an entity", () => {
    const { deals, problems, warnings } = parsePipeline(SHEET([row(), row({ No: 2 }), row({ No: 3, "Perusahaan/Entitas": "MATRIK", COA: "Tidak Ada" })]), COA);
    expect([deals.length, problems]).toEqual([3, []]);
    expect(warnings).toEqual([
      { no: 3, message: "COA pendapatan belum dikenali; wajib diisi di aplikasi" },
      { no: 2, message: "Project Name sama dengan No 1 di entitas ESTRADA; harus unik" },
    ]);
  });

  it("prefers a COA Master code over a provisional one with the same name, and keeps an unknown COA name as a note", () => {
    const { deals } = parsePipeline(SHEET([row({ COA: "Pendapatan Harwat Smart City" }), row({ No: 2, COA: "Pendapatan Smart City", Start: "Oct", End: "Oct" })]), COA);
    expect(deals.map((d) => [d.coaCode, d.notes, d.startMonth, d.endMonth])).toEqual([
      ["4200", null, 1, 12],
      [null, "COA di workbook: Pendapatan Smart City", 10, 10],
    ]);
  });

  it("reads BCD's revenue target per segment from the legend, in miliar", () => {
    const { targets } = parsePipeline(SHEET([row(), row({ No: 2 })], [["Telco Business", "250M"], ["Government Business", "150M"]]), COA);
    expect(targets.map((t) => [t.segment, t.target.toFixed(0)])).toEqual([
      ["Telco Business", "250000000000"],
      ["Government Business", "150000000000"],
    ]);
  });

  it("stops on rows it cannot place", () => {
    const { problems } = parsePipeline(SHEET([row({ No: 7, Status: "XX" }), row({ No: 8, "Type Project": "Upsell" }), row({ No: 9, Start: "Q1" })]), COA);
    expect(problems).toEqual([
      { no: 7, message: "Status tidak dikenal: XX" },
      { no: 8, message: "Type Project tidak dikenal: Upsell" },
      { no: 9, message: "Bulan tidak dikenal: Q1" },
    ]);
  });
});
