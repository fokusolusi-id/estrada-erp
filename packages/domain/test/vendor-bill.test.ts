import { describe, expect, it } from "vitest";
import { isVendorBill, pphOf, readyToSubmit } from "../src/payment";
import { money } from "../src/money";

const base = { kind: "payment" as const, entity: "ESTRADA", budgetLineId: "l", description: "Server", gross: money("500000000"), documents: ["invoice" as const] };

describe("vendor bills (P1_Module_Spec P1-M3; client decision: a Pembayaran with a Mitra)", () => {
  it("is a payment, not a cash advance, that names a Mitra", () => {
    expect([isVendorBill({ kind: "payment", partnerId: "Mitra-001" }), isVendorBill({ kind: "payment", partnerId: null }), isVendorBill({ kind: "cash_advance", partnerId: "Mitra-001" })]).toEqual([true, false, false]);
  });
  it("needs the vendor's invoice number and date before it is submitted", () => {
    expect(readyToSubmit({ ...base, partnerId: "Mitra-001", vendorInvoiceNo: " ", billDate: null })).toEqual(["Isi nomor invoice vendor", "Isi tanggal invoice vendor"]);
    expect(readyToSubmit({ ...base, partnerId: "Mitra-001", vendorInvoiceNo: "INV-9", billDate: "2027-01-05" })).toEqual([]);
    expect(readyToSubmit(base)).toEqual([]);
  });
  it("withholds PPh from the DPP: 2% of Rp 500 juta is Rp 10 juta", () => {
    expect(pphOf(money("500000000"), money("2")).toString()).toBe("10000000");
    expect(pphOf(money("100.05"), money("2")).toString()).toBe("2");
  });
});
