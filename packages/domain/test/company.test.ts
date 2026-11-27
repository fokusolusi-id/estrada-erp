import { describe, expect, it } from "vitest";
import { companyIssues } from "../src/company";

describe("companyIssues (sheet M Perusahaan, review list)", () => {
  it("flags an all-zero NPWP and a NIB two companies share, changing nothing", () => {
    const list = [
      { code: "ESTRADA", npwp: "0000000000000000", nib: "1234567889" },
      { code: "MATRIK", npwp: "01.234.567.8-901.000", nib: "1234567889" },
      { code: "PAS", npwp: null, nib: null },
    ];
    expect(companyIssues(list).map((i) => `${i.code} ${i.message}`)).toEqual([
      "ESTRADA NPWP masih nomor sementara",
      "ESTRADA NIB sama dengan MATRIK",
      "MATRIK NIB sama dengan ESTRADA",
    ]);
  });
});
