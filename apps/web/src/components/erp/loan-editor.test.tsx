import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LoanEditor, type LoanRow } from "./loan-editor";

const zeros = Array.from({ length: 12 }, () => "0");
// Obligo Pinjaman Bank's existing facility: Rp 40,78 bn at 10%, no moves.
const existing: LoanRow = {
  id: "a",
  name: "Pinjaman Bank Existing (Mandiri/BRI/BCA/CIMB)",
  type: "existing",
  entity: "ESTRADA",
  rate: "0.1",
  openingBalance: "40782658280.84",
  creditLimit: null,
  notes: null,
  drawdown: zeros,
  repayment: zeros,
  outstandingEnd: "40782658280.84",
  interestTotal: "4078265828.04",
};
const ok = () => vi.fn(async () => ({ ok: true, message: "Fasilitas disimpan." }));

describe("LoanEditor", () => {
  it("lists facilities with rate, outstanding at year end and the year's interest", () => {
    render(<LoanEditor facilities={[existing]} entities={["ESTRADA", "MATRIK"]} editable onSave={ok()} onDelete={ok()} />);
    const row = within(screen.getByTestId("loan-a"));
    expect(row.getByText("10%")).toBeTruthy();
    expect(row.getByTestId("interest").textContent).toBe("Rp 4.078.265.828");
  });

  it("adds a facility with a drawdown and a repayment, as plain decimals and a rate fraction", async () => {
    const onSave = ok();
    render(<LoanEditor facilities={[existing]} entities={["ESTRADA", "MATRIK"]} editable onSave={onSave} onDelete={ok()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tambah fasilitas" }));
    fireEvent.change(screen.getByLabelText("Nama fasilitas"), { target: { value: "KMK Mandiri" } });
    fireEvent.change(screen.getByLabelText("Entitas fasilitas"), { target: { value: "MATRIK" } });
    fireEvent.change(screen.getByLabelText("Suku bunga (%)"), { target: { value: "9,5" } });
    fireEvent.change(screen.getByLabelText("Penarikan Mar"), { target: { value: "10.000.000.000" } });
    fireEvent.change(screen.getByLabelText("Pelunasan Des"), { target: { value: "2.500.000.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan fasilitas" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ id: null, name: "KMK Mandiri", type: "new", entity: "MATRIK", rate: "0.095", openingBalance: "0" }),
      ),
    );
    const sent = (onSave.mock.calls[0] as unknown as [{ drawdown: string[]; repayment: string[] }])[0];
    expect([sent.drawdown[2], sent.repayment[11], sent.drawdown[0]]).toEqual(["10000000000", "2500000000", "0"]);
  });

  it("is read-only for readers", () => {
    render(<LoanEditor facilities={[existing]} entities={["ESTRADA"]} editable={false} onSave={ok()} onDelete={ok()} />);
    expect(screen.queryByRole("button", { name: "Tambah fasilitas" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Ubah/ })).toBeNull();
  });
});
