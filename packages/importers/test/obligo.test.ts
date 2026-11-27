import { describe, expect, it } from "vitest";
import { parseObligo } from "../src/obligo";

const rows = [
  ["STATUS OBLIGO BANK — PER 14 APRIL 2026"],
  ["Bank", "Fasilitas", "Perusahaan", "Plafon (IDR)", "Outstanding (IDR)", "Kelonggaran (IDR)", "Underlying Projek", "Due Date", "Status Tagihan"],
  ["Mandiri", "M71", "Estrada", 60000000000, 3000000000, null, "Imigrasi Jan-Jun 2025", "15/10/2026", "BAPL"],
  ["Mandiri", "M71", "Estrada", null, 4100000000, null, "Imigrasi Jul-Des 2025", new Date("2026-10-15"), "BAPL"],
  ["BRI", "TNI/POLRI", "-", 25000000000, 0, null, "-", "-", "-"],
  ["BCA", "KMK", "Matrik", 4240000000, 3000000000, null, "Projek 2026", "30/12/2026", "Aktif"],
  ["BCA", "KMK", "Estrada", 1000000000, 1000000000, null, "Projek 2026", "30/12/2026", "Aktif"],
  ["SUB-TOTAL MANDIRI", null, null, 80000000000],
] as const;

describe("parseObligo (sheet 14_Obligo_Status_Apr2026)", () => {
  const found = parseObligo(rows.map((r) => [...r]));
  it("makes one facility per bank, name and company, with the interest day of sheet 10_Liabilities", () => {
    expect(found.map((f) => [f.bankName, f.name, f.entityCode, f.plafon, f.interestDay])).toEqual([
      ["Mandiri", "M71", "ESTRADA", "60000000000.00", 15],
      ["BRI", "TNI/POLRI", null, "25000000000.00", 25],
      ["BCA", "KMK", "MATRIK", "4240000000.00", 3],
      ["BCA", "KMK", "ESTRADA", "1000000000.00", 3],
    ]);
  });
  it("keeps each outstanding drawing with its underlying and due date", () => {
    expect(found[0]!.drawings).toEqual([
      { amount: "3000000000.00", underlying: "Imigrasi Jan-Jun 2025", dueOn: "2026-10-15", note: "BAPL" },
      { amount: "4100000000.00", underlying: "Imigrasi Jul-Des 2025", dueOn: "2026-10-15", note: "BAPL" },
    ]);
    expect(found[1]!.drawings).toEqual([]);
  });
});
