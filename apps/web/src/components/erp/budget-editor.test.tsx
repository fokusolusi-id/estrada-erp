import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BudgetEditor, type EditorLine } from "./budget-editor";

const masters = {
  coa: [
    { code: "6241", name: "Beban internet", category: "OPEX", defaultOwnerUnit: "SCM" },
    { code: "6211", name: "Beban Gaji dan THR", category: "OPEX", defaultOwnerUnit: "HCM" },
  ],
  entities: ["ESTRADA", "MATRIK"],
  units: [
    { code: "SCM", name: "Supply Chain Management" },
    { code: "HCM", name: "Human Capital Management" },
  ],
};

const zero = Array.from({ length: 12 }, () => "0");
const lines: EditorLine[] = [
  { id: "11111111-1111-4111-8111-111111111111", coaCode: "6241", entityCode: "ESTRADA", ownerUnit: "SCM", item: "Internet kantor", basis: "Kontrak 2027", months: zero, rka2026: "200000000", actual2026: "180000000", flags: ["Cek potensi double counting dengan RKA HCM"] },
  { id: "22222222-2222-4222-8222-222222222222", coaCode: "6241", entityCode: "ESTRADA", ownerUnit: "SCM", item: "Internet gudang", basis: "", months: zero, remark: { by: "Bayu (Head SCM)", comment: "Basis kontrak belum dilampirkan" } },
];

const ok = () => vi.fn(async () => ({ ok: true, message: "ok", id: "33333333-3333-4333-8333-333333333333" }));
const setup = () => {
  const props = { lines, masters, defaultEntity: "ESTRADA", onSave: ok(), onDelete: ok(), onSubmit: ok() };
  render(<BudgetEditor {...props} />);
  return props;
};
const cell = (row: number, month: number) => screen.getByLabelText(`Baris ${row} bulan ${month}`) as HTMLInputElement;
const paste = (el: HTMLElement, text: string) =>
  fireEvent.paste(el, { clipboardData: { getData: () => text } });

describe("BudgetEditor", () => {
  it("pastes a row copied from Excel across the months", () => {
    setup();
    paste(cell(1, 1), "1.000\t2.000\t3.000");
    expect([cell(1, 1).value, cell(1, 2).value, cell(1, 3).value]).toEqual(["1.000", "2.000", "3.000"]);
    expect(screen.getByTestId("editor-total-1").textContent).toBe("Rp 6.000");
  });

  it("pastes a block onto the rows below", () => {
    setup();
    paste(cell(1, 11), "5\t6\t7\r\n8\t9\r\n");
    expect([cell(1, 11).value, cell(1, 12).value]).toEqual(["5", "6"]);
    expect([cell(2, 11).value, cell(2, 12).value]).toEqual(["8", "9"]);
  });

  it("fills a monthly amount right to December", () => {
    setup();
    fireEvent.change(cell(1, 3), { target: { value: "19.821.320" } });
    fireEvent.focus(cell(1, 3));
    fireEvent.click(screen.getAllByRole("button", { name: "Isi ke kanan" })[0]!);
    expect(cell(1, 12).value).toBe("19.821.320");
    expect(cell(1, 2).value).toBe("0");
    expect(screen.getByTestId("editor-total-1").textContent).toBe("Rp 198.213.200");
  });

  it("flags text that is not an amount and blocks saving", () => {
    setup();
    fireEvent.change(cell(1, 1), { target: { value: "lima juta" } });
    expect(cell(1, 1).getAttribute("aria-invalid")).toBe("true");
    expect((screen.getAllByRole("button", { name: "Simpan" })[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves months as plain decimals, never formatted text", async () => {
    const props = setup();
    fireEvent.change(cell(1, 1), { target: { value: "1.234.567,89" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Simpan" })[0]!);
    await waitFor(() => expect(props.onSave).toHaveBeenCalled());
    const arg = (props.onSave.mock.calls[0] as unknown[])[0] as { months: string[]; id: string };
    expect(arg.id).toBe(lines[0]!.id);
    expect(arg.months[0]).toBe("1234567.89");
    expect(arg.months[1]).toBe("0");
  });

  it("defaults the budget owner to the COA's default owner unit", () => {
    setup();
    fireEvent.change(screen.getByLabelText("COA baris 1"), { target: { value: "6211" } });
    expect((screen.getByLabelText("Unit pemilik baris 1") as HTMLSelectElement).value).toBe("HCM");
  });

  it("submits only saved, unchanged lines", async () => {
    const props = setup();
    fireEvent.change(cell(2, 1), { target: { value: "5" } });
    expect((screen.getByLabelText("Pilih baris 2") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Pilih baris 1"));
    fireEvent.click(screen.getByRole("button", { name: /Kirim ke Default Owner \(1\)/ }));
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith([lines[0]!.id]));
  });

  it("adds a new empty line", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Tambah baris" }));
    expect(cell(3, 1).value).toBe("0");
  });

  it("shows why a line came back", () => {
    setup();
    expect(screen.getByText("Dikembalikan oleh Bayu (Head SCM): “Basis kontrak belum dilampirkan”")).toBeTruthy();
  });

  it("shows the 2026 figures and review flags while the requestor edits", () => {
    setup();
    expect(screen.getByText("2026: RKA Rp 200.000.000 · Actual Rp 180.000.000")).toBeTruthy();
    expect(screen.getByText("Cek potensi double counting dengan RKA HCM")).toBeTruthy();
  });
});
