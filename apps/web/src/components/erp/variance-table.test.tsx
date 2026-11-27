import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VarianceTable, type VarianceRow } from "./variance-table";

const row = (over: Partial<VarianceRow>): VarianceRow => ({
  unit: "SCM",
  coaCode: null,
  label: "SCM",
  budget: "Rp 2.000",
  actual: "Rp 1.500",
  severity: "escalate",
  sentence: "SCM di bawah budget.",
  notes: [],
  canNote: true,
  ...over,
});

describe("VarianceTable (37_Variance_Analysis)", () => {
  afterEach(cleanup);

  it("asks for the missing root cause of an escalated row and saves it", async () => {
    const onSave = vi.fn(async () => ({ ok: true, message: "Catatan disimpan." }));
    render(<VarianceTable rows={[row({})]} onSave={onSave} />);
    const card = within(screen.getByTestId("variance-SCM"));
    expect(card.getByText("Catatan penyebab wajib")).toBeTruthy();
    fireEvent.change(card.getByLabelText("Catatan penyebab SCM"), { target: { value: "Pengadaan mundur ke April." } });
    fireEvent.click(card.getByRole("button", { name: "Simpan catatan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("SCM", null, "Pengadaan mundur ke April."));
  });

  it("shows the notes and offers no form to a reader", () => {
    render(<VarianceTable rows={[row({ notes: [{ text: "Vendor belum menagih.", by: "Dewi", at: "27 Nov 2026" }], canNote: false })]} onSave={vi.fn()} />);
    const card = within(screen.getByTestId("variance-SCM"));
    expect(card.getByText("Vendor belum menagih.")).toBeTruthy();
    expect(card.queryByText("Catatan penyebab wajib")).toBeNull();
    expect(card.queryByRole("button")).toBeNull();
  });
});
