import { describe, expect, it } from "vitest";
import { parsePartnerProducts, parsePartners } from "../src/index";

const HEADER = ["ID", "Nama Mitra", "Kategori", "NPWP", "Kota", "Email", "Alamat", "Telpon", "Nama PIC", "Telp PIC", "Jabatan PIC", "Email PIC"];
const sheet = (...rows: string[][]) => [["Master Mitra"], HEADER, ...rows];

describe("parsePartners (Master Mitra)", () => {
  it("reads one partner per ID, dropping hidden Unicode from the NPWP and other cells (Mitra-002)", () => {
    const [p] = parsePartners(sheet(["Mitra-002", "PT Blue Power Technology ", "Distributor", "‭0024331720063000‬", "Jakarta", "", "", "‭+622180622278‬"]));
    expect(p).toEqual({
      id: "Mitra-002",
      name: "PT Blue Power Technology",
      category: "Distributor",
      npwp: "0024331720063000",
      city: "Jakarta",
      email: null,
      address: null,
      phone: "+622180622278",
      picName: null,
      picPhone: null,
      picTitle: null,
      picEmail: null,
    });
  });

  it("stops on a category other than Distributor or Principle (BR-SCM-004)", () => {
    expect(() => parsePartners(sheet(["Mitra-001", "PT A", "Reseller"]))).toThrow("Reseller");
  });

  it("stops on an ID used twice or a partner without a name", () => {
    const row = ["Mitra-001", "PT A", "Principle"];
    expect(() => parsePartners(sheet(row, row))).toThrow("Mitra-001");
    expect(() => parsePartners(sheet(["Mitra-002", "", "Principle"]))).toThrow("Mitra-002");
  });
});

const PRODUCT_HEADER = ["ID", "Nama Mitra", "Kategori", "Jenis", "Brand"];
const products = (...rows: string[][]) => [["Master Product Mitra"], PRODUCT_HEADER, ...rows];

describe("parsePartnerProducts (Master Produk Mitra)", () => {
  it("reads the sheet's ID column as the partner, since the sheet gives products no ID of their own", () => {
    expect(parsePartnerProducts(products(["Mitra-002", "PT Blue Power Technology", "Hardware", "AP, Switch", "Cambium "]))).toEqual([
      { partnerId: "Mitra-002", partnerName: "PT Blue Power Technology", category: "Hardware", type: "AP, Switch", brand: "Cambium" },
    ]);
  });

  it("reads a repeated row once", () => {
    const row = ["Mitra-001", "PT A", "Hardware", "Router", "Ransnet"];
    expect(parsePartnerProducts(products(row, row))).toHaveLength(1);
  });

  it("stops on a row without partner, kategori, jenis or brand", () => {
    expect(() => parsePartnerProducts(products(["Mitra-001", "PT A", "Hardware", "", "Ransnet"]))).toThrow("Mitra-001");
  });
});
