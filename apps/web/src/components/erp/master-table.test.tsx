import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MasterTable, type MasterField, type MasterRow } from "./master-table";

const fields: MasterField[] = [
  { name: "name", label: "Nama mitra", column: true, required: true },
  { name: "category", label: "Kategori", column: true, type: "select", options: [{ value: "Distributor" }, { value: "Principle" }] },
  { name: "npwp", label: "NPWP" },
];
const rows: MasterRow[] = [
  { id: "Mitra-001", values: { name: "PT Lixa", category: "Distributor", npwp: "1", active: true }, issues: [] },
  { id: "Mitra-004", values: { name: "PT IDN", category: "Distributor", npwp: "", active: true }, issues: ["NPWP kosong"] },
];

describe("MasterTable", () => {
  afterEach(cleanup);

  it("searches the list and shows what needs review", () => {
    render(<MasterTable noun="mitra" fields={fields} rows={rows} />);
    expect(within(screen.getByTestId("master-Mitra-004")).getByText("NPWP kosong")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Cari mitra"), { target: { value: "lixa" } });
    expect(screen.queryByTestId("master-Mitra-004")).toBeNull();
  });

  it("is read only without a save action", () => {
    render(<MasterTable noun="mitra" fields={fields} rows={rows} />);
    expect(screen.queryByRole("button", { name: /Tambah|Ubah/ })).toBeNull();
  });

  it("edits a record and shows the answer", async () => {
    const onSave = vi.fn(async () => ({ ok: true, message: "Mitra disimpan." }));
    render(<MasterTable noun="mitra" fields={fields} rows={rows} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah Mitra-004" }));
    const form = within(screen.getByRole("form", { name: "Mitra-004" }));
    fireEvent.change(form.getByLabelText("NPWP"), { target: { value: "2" } });
    fireEvent.click(form.getByLabelText("Aktif"));
    fireEvent.click(form.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("Mitra-004", { name: "PT IDN", category: "Distributor", npwp: "2", active: false }));
    expect(await screen.findByText("Mitra disimpan.")).toBeTruthy();
  });

  it("asks for a create-only field on a new record and locks it afterwards", () => {
    render(<MasterTable noun="mitra" fields={[{ name: "code", label: "Kode", createOnly: true }, ...fields]} rows={rows} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tambah mitra" }));
    expect((screen.getByLabelText("Kode") as HTMLInputElement).readOnly).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Ubah Mitra-001" }));
    expect((screen.getByLabelText("Kode") as HTMLInputElement).readOnly).toBe(true);
  });

  it("starts a new record active, with the first choice of each list", () => {
    render(<MasterTable noun="mitra" fields={fields} rows={rows} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tambah mitra" }));
    const form = within(screen.getByRole("form", { name: "Tambah mitra" }));
    expect((form.getByLabelText("Aktif") as HTMLInputElement).checked).toBe(true);
    expect((form.getByLabelText("Kategori") as HTMLSelectElement).value).toBe("Distributor");
  });
});
