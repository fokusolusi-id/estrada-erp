import { describe, expect, it } from "vitest";
import { parseCustomers } from "../src/index";

const HEADER = ["ID", "Nickname Customer", "Segmen", "Nama Customer", "NPWP", "Email", "Alamat", "Telpon", "Nama PIC", "Telp PIC", "Jabatan PIC", "Email PIC"];
const sheet = (...rows: string[][]) => [["Master Customer"], HEADER, ...rows];

describe("parseCustomers (M Customer)", () => {
  it("reads one customer per ID, leaving blank cells empty", () => {
    const [c] = parseCustomers(sheet(["Cust-001", "Telkom", "Telco", " PT Telkom  Indonesia ", "01.000.013.1-093.000", "email@telkom.co.id", "Jakarta"]));
    expect(c).toEqual({
      id: "Cust-001",
      nickname: "Telkom",
      segment: "Telco",
      legalName: "PT Telkom Indonesia",
      npwp: "010000131093000",
      email: "email@telkom.co.id",
      address: "Jakarta",
      phone: null,
      picName: null,
      picPhone: null,
      picTitle: null,
      picEmail: null,
    });
  });

  it("skips rows without an ID", () => {
    expect(parseCustomers(sheet(["", "x"], []))).toEqual([]);
  });

  it("stops on an ID used twice", () => {
    const row = ["Cust-001", "Telkom", "Telco", "PT Telkom Indonesia"];
    expect(() => parseCustomers(sheet(row, row))).toThrow("Cust-001");
  });

  it("stops on a customer without a name or segment", () => {
    expect(() => parseCustomers(sheet(["Cust-001", "Telkom", "Telco", ""]))).toThrow("Cust-001");
    expect(() => parseCustomers(sheet(["Cust-002", "XL", "", "PT XL Smart"]))).toThrow("Cust-002");
  });
});
