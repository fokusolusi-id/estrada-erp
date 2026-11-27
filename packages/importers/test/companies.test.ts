import { describe, expect, it } from "vitest";
import { parseCompanies } from "../src/index";

const HEADER = ["No", "ID_Perusahaan", "Nama Perusahaan", "NPWP", "No NIB", "Alamat", "Kedudukan", "Phone", "Email", "Direktur", "Komisaris", "Modal Dasar"];
const row = ["1", "ESTRADA", "PT. Elang Strategi Adidaya", "0000000000000000", 1234567889, "Rukan Pesona View Blok A1", "Kota Depok", "021-0998374", "info@estrada.co.id", "Luluk Nurhayati", "Mochamad Farid", 2000000000];

describe("parseCompanies (sheet M Perusahaan, BR-MD-001)", () => {
  it("reads one company per ID, keeping the capital as money and the NPWP as typed", () => {
    expect(parseCompanies([HEADER, row])).toEqual([
      {
        code: "ESTRADA",
        name: "PT. Elang Strategi Adidaya",
        npwp: "0000000000000000",
        nib: "1234567889",
        address: "Rukan Pesona View Blok A1",
        domicile: "Kota Depok",
        phone: "021-0998374",
        email: "info@estrada.co.id",
        director: "Luluk Nurhayati",
        commissioner: "Mochamad Farid",
        authorisedCapital: "2000000000.00",
      },
    ]);
  });

  it("leaves blank cells empty, and stops on an ID used twice or a row without a name", () => {
    const blank = ["2", "MATRIK", "PT. Madina Mitra Teknik"];
    expect(parseCompanies([HEADER, blank])[0]).toMatchObject({ npwp: null, authorisedCapital: null });
    expect(() => parseCompanies([HEADER, row, row])).toThrow("ESTRADA");
    expect(() => parseCompanies([HEADER, ["3", "DJALU", ""]])).toThrow("DJALU");
  });
});
