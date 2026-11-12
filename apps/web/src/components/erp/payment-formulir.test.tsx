import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PaymentFormulir, type FormulirData } from "./payment-formulir";

const d: FormulirData = {
  entityName: "PT Estrada",
  entityCode: "ESTRADA",
  number: "PP/ESTRADA/2026/11/0001",
  kind: "Pembayaran",
  date: "12 November 2026",
  status: "Paid",
  requester: "Rina",
  requesterUnit: "SCM",
  project: null,
  line: "6241 · Beban internet (SCM, RKA 2027)",
  description: "Tagihan internet kantor Oktober",
  payee: "PT Vendor Internet",
  payeeAccount: "BCA 0011",
  dueOn: null,
  gross: "10000000",
  ppn: "1100000",
  pph: "200000",
  documents: ["Invoice", "Faktur Pajak"],
  bank: "BCA 123-456-7890 · PT Estrada",
  scheduledOn: "20 November 2026",
  paidOn: "20 November 2026",
  signs: [
    { step: "Pemohon", name: "Rina", role: "Requestor", at: "12 Nov 2026 09.00" },
    { step: "Atasan", name: "Bayu", role: "Default Owner", at: "12 Nov 2026 10.00" },
    { step: "BFP", name: "Lina", role: "Business Finance (BFP)", at: "13 Nov 2026 08.00" },
    { step: "Head Divisi", name: null, role: "Division Owner", at: null },
    { step: "Cash Management", name: null, role: "Cash Management", at: null },
  ],
};

describe("PaymentFormulir", () => {
  it("prints the number, the amounts with the nett in figures and words", () => {
    render(<PaymentFormulir d={d} />);
    expect(screen.getByText("PP/ESTRADA/2026/11/0001")).toBeTruthy();
    expect(screen.getByTestId("formulir-nett").textContent).toBe("Rp 10.900.000");
    expect(screen.getByTestId("formulir-terbilang").textContent).toBe("Terbilang: sepuluh juta sembilan ratus ribu rupiah");
    expect(screen.getByText("Invoice, Faktur Pajak")).toBeTruthy();
  });

  it("shows each approval box, signed electronically or still open", () => {
    render(<PaymentFormulir d={d} />);
    const boxes = within(screen.getByRole("region", { name: "Persetujuan" })).getAllByText(/Disetujui elektronik|Belum/);
    expect(boxes.map((b) => b.textContent)).toEqual([
      "Disetujui elektronik 12 Nov 2026 09.00",
      "Disetujui elektronik 12 Nov 2026 10.00",
      "Disetujui elektronik 13 Nov 2026 08.00",
      "Belum",
      "Belum",
    ]);
  });
});
