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
  { id: "11111111-1111-4111-8111-111111111111", coaCode: "6241", entityCode: "ESTRADA", ownerUnit: "SCM", item: "Internet kantor", basis: "Kontrak 2027", months: zero, priorRka: "200000000", priorActual: "180000000", flags: ["Cek potensi double counting dengan RKA HCM"] },
  { id: "22222222-2222-4222-8222-222222222222", coaCode: "6241", entityCode: "MATRIK", ownerUnit: "SCM", item: "Internet gudang", basis: "", months: zero, remark: { by: "Bayu (Head SCM)", comment: "Basis kontrak belum dilampirkan" } },
];

const ok = () => vi.fn(async () => ({ ok: true, message: "ok", id: "33333333-3333-4333-8333-333333333333" }));
const setup = () => {
  const props = { lines, masters, defaultEntity: "ESTRADA", onSave: ok(), onDelete: ok(), onSubmit: ok() };
  render(<BudgetEditor priorYear={2026} {...props} />);
  return props;
};
const cell = (row: number, month: number) => screen.getByLabelText(`Baris ${row} bulan ${month}`) as HTMLInputElement;
/** Choose a dropdown value the way a person does: touch it (which loads its options), then pick. */
const pick = (label: string, value: string) => {
  const el = screen.getByLabelText(label);
  fireEvent.mouseDown(el);
  fireEvent.change(el, { target: { value } });
};
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

  it("splits a yearly total typed once evenly over the 12 months, which stay editable", () => {
    setup();
    const total = screen.getByLabelText("Total setahun baris 1") as HTMLInputElement;
    fireEvent.change(total, { target: { value: "45.000.000" } });
    fireEvent.blur(total);
    expect([cell(1, 1).value, cell(1, 12).value]).toEqual(["3.750.000", "3.750.000"]);
    expect(screen.getByTestId("editor-total-1").textContent).toBe("Rp 45.000.000");
    expect(total.value).toBe("");
    fireEvent.change(cell(1, 1), { target: { value: "4.000.000" } });
    expect(screen.getByTestId("editor-total-1").textContent).toBe("Rp 45.250.000");
  });

  it("puts the leftover of an uneven total in December, so the months add up", () => {
    setup();
    const total = screen.getByLabelText("Total setahun baris 1") as HTMLInputElement;
    fireEvent.change(total, { target: { value: "100.000" } });
    fireEvent.keyDown(total, { key: "Enter" });
    expect(screen.getByTestId("editor-total-1").textContent).toBe("Rp 100.000");
  });

  it("refuses the same COA twice for one entity and owner, but allows another entity", () => {
    setup();
    expect(screen.queryByText(/sudah ada untuk Entitas dan Pemilik yang sama/)).toBeNull();
    pick("Entitas baris 2", "ESTRADA");
    expect(screen.getAllByText(/sudah ada untuk Entitas dan Pemilik yang sama/).length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Simpan (1)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("greys out a COA another line already holds for the same entity and owner, but never the line's own", () => {
    const props = { lines: [lines[0]!], masters, defaultEntity: "ESTRADA", onSave: ok(), onDelete: ok(), onSubmit: ok() };
    render(<BudgetEditor priorYear={2026} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Tambah baris" }));
    pick("Unit pemilik baris 2", "SCM");
    // Moving to the owner dropdown leaves the COA one, so each list is judged afresh when it is touched again.
    fireEvent.blur(screen.getByLabelText("COA baris 2"));
    fireEvent.mouseDown(screen.getByLabelText("COA baris 2"));
    fireEvent.mouseDown(screen.getByLabelText("COA baris 1"));
    const opt = Array.from((screen.getByLabelText("COA baris 2") as HTMLSelectElement).options).find((o) => o.value === "6241")!;
    expect(opt.disabled).toBe(true);
    expect(opt.textContent).toMatch(/sudah dipakai/);
    const own = Array.from((screen.getByLabelText("COA baris 1") as HTMLSelectElement).options).find((o) => o.value === "6241")!;
    expect(own.disabled).toBe(false);
    // Another owner is another slot, so the same COA is free there.
    pick("Unit pemilik baris 2", "HCM");
    fireEvent.blur(screen.getByLabelText("COA baris 2"));
    fireEvent.mouseDown(screen.getByLabelText("COA baris 2"));
    expect(Array.from((screen.getByLabelText("COA baris 2") as HTMLSelectElement).options).find((o) => o.value === "6241")!.disabled).toBe(false);
  });

  it("starts a new line on the first expense COA still free, not on an asset account", () => {
    const withAsset = {
      ...masters,
      coa: [{ code: "1615", name: "Inventaris Kantor", category: "CAPEX", defaultOwnerUnit: "PST" }, ...masters.coa],
    };
    render(<BudgetEditor priorYear={2026} lines={[lines[0]!]} masters={withAsset} defaultEntity="ESTRADA" onSave={ok()} onDelete={ok()} onSubmit={ok()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tambah baris" }));
    // 6241 is taken for ESTRADA / SCM, so the new line takes 6211 and that COA's owner.
    expect((screen.getByLabelText("COA baris 2") as HTMLSelectElement).value).toBe("6211");
    expect((screen.getByLabelText("Unit pemilik baris 2") as HTMLSelectElement).value).toBe("HCM");
  });

  it("offers no parent COA, except the one a line already sits on", () => {
    const parent = (code: string) => ({ code, name: `Induk ${code}`, category: "OPEX", defaultOwnerUnit: "SCM", postable: false });
    render(<BudgetEditor priorYear={2026} lines={[{ ...lines[0]!, coaCode: "6240" }]} masters={{ ...masters, coa: [parent("6200"), parent("6240"), ...masters.coa] }} defaultEntity="ESTRADA" onSave={ok()} onDelete={ok()} onSubmit={ok()} />);
    fireEvent.mouseDown(screen.getByLabelText("COA baris 1"));
    expect(Array.from((screen.getByLabelText("COA baris 1") as HTMLSelectElement).options).map((o) => o.value)).toEqual(["6240", "6241", "6211"]);
    fireEvent.click(screen.getByRole("button", { name: "Tambah baris" }));
    expect((screen.getByLabelText("COA baris 2") as HTMLSelectElement).value).toBe("6241");
  });

  it("keeps only the chosen option in each dropdown until it is touched, so a long draft stays light", () => {
    setup();
    const coa = screen.getByLabelText("COA baris 1") as HTMLSelectElement;
    const owner = screen.getByLabelText("Unit pemilik baris 1") as HTMLSelectElement;
    expect([coa.options.length, owner.options.length]).toEqual([1, 1]);
    expect([coa.value, owner.value]).toEqual(["6241", "SCM"]);
    fireEvent.mouseDown(coa);
    expect(coa.options.length).toBe(masters.coa.length);
    expect(coa.value).toBe("6241");
    fireEvent.focus(owner);
    expect(owner.options.length).toBe(masters.units.length);
  });

  it("keeps the greyed-out COAs steady while a dropdown is in use, so typing a code is not cut short", () => {
    // 6211 is held for ESTRADA / SCM by the third line. A new line starts on 6211 for HCM (its default owner).
    const held: EditorLine = { id: "33333333-3333-4333-8333-333333333333", coaCode: "6211", entityCode: "ESTRADA", ownerUnit: "SCM", item: "", basis: "", months: zero };
    render(<BudgetEditor priorYear={2026} lines={[lines[0]!, held]} masters={masters} defaultEntity="ESTRADA" onSave={ok()} onDelete={ok()} onSubmit={ok()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tambah baris" }));
    const coa = screen.getByLabelText("COA baris 3") as HTMLSelectElement;
    const opt = (code: string) => Array.from(coa.options).find((o) => o.value === code)!;
    fireEvent.mouseDown(coa);
    expect((screen.getByLabelText("Unit pemilik baris 3") as HTMLSelectElement).value).toBe("HCM");
    // Picking 6241 moves the owner to SCM, where 6211 is held, but the list must not shift under the typing.
    fireEvent.change(coa, { target: { value: "6241" } });
    expect((screen.getByLabelText("Unit pemilik baris 3") as HTMLSelectElement).value).toBe("SCM");
    expect(opt("6211").disabled).toBe(false);
    // Once the dropdown is left, the list is judged afresh.
    fireEvent.blur(coa);
    fireEvent.mouseDown(coa);
    expect(opt("6211").disabled).toBe(true);
    expect(opt("6211").textContent).toMatch(/sudah dipakai/);
  });

  it("flags text that is not an amount and blocks saving", () => {
    setup();
    fireEvent.change(cell(1, 1), { target: { value: "lima juta" } });
    expect(cell(1, 1).getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByRole("button", { name: "Simpan (1)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves months as plain decimals, never formatted text", async () => {
    const props = setup();
    fireEvent.change(cell(1, 1), { target: { value: "1.234.567,89" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan (1)" }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalled());
    const arg = (props.onSave.mock.calls[0] as unknown[])[0] as { months: string[]; id: string };
    expect(arg.id).toBe(lines[0]!.id);
    expect(arg.months[0]).toBe("1234567.89");
    expect(arg.months[1]).toBe("0");
  });

  it("saves every changed row in one go from the save bar, and says how many", async () => {
    const props = setup();
    expect(screen.queryByRole("button", { name: /^Simpan/ })).toBeNull();
    fireEvent.change(cell(1, 1), { target: { value: "1.000" } });
    fireEvent.change(cell(2, 1), { target: { value: "2.000" } });
    expect(screen.getByText("2 baris belum disimpan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Simpan (2)" }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("2 baris tersimpan.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Simpan/ })).toBeNull();
  });

  it("defaults the budget owner to the COA's default owner unit", () => {
    setup();
    pick("COA baris 1", "6211");
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

  it("folds the 2026 figures and review flags behind one notes button, so rows stay short", () => {
    setup();
    expect(screen.queryByText("Cek potensi double counting dengan RKA HCM")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Catatan baris 1" }));
    expect(screen.getByText("2026: RKA Rp 200.000.000 · Actual Rp 180.000.000")).toBeTruthy();
    expect(screen.getByText("Cek potensi double counting dengan RKA HCM")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Catatan baris 2" })).toBeNull();
  });

  it("links each saved draft to its discussion, so questions reach the requestor while they edit", () => {
    render(<BudgetEditor priorYear={2026} lines={[{ ...lines[0]!, commentCount: 1 }, lines[1]!]} masters={masters} defaultEntity="ESTRADA" onSave={ok()} onDelete={ok()} onSubmit={ok()} />);
    expect(screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Diskusi (1)", `/rka/line/${lines[0]!.id}`],
      ["Diskusi", `/rka/line/${lines[1]!.id}`],
    ]);
  });

  it("shows a line from the headcount plan read-only, but still lets it be sent", () => {
    const planned: EditorLine = { id: "44444444-4444-4444-8444-444444444444", coaCode: "6221", entityCode: "ESTRADA", ownerUnit: "HCM", item: "Account Manager", basis: "Rencana headcount: 6 orang", months: Array.from({ length: 12 }, () => "100500000"), planned: true };
    const props = { lines: [lines[0]!, planned], masters, defaultEntity: "ESTRADA", onSave: ok(), onDelete: ok(), onSubmit: ok() };
    const { rerender } = render(<BudgetEditor priorYear={2026} {...props} />);
    expect(cell(2, 1).disabled).toBe(true);
    expect((screen.getByLabelText("Uraian baris 2") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByRole("button", { name: "Hapus baris" })[1]!.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Dihitung dari Rencana headcount")).toBeTruthy();
    expect((screen.getByLabelText("Pilih baris 2") as HTMLInputElement).disabled).toBe(false);

    // Saving the plan re-renders the page; the editor shows the new months without losing unsaved edits elsewhere.
    fireEvent.change(cell(1, 1), { target: { value: "5.000" } });
    rerender(<BudgetEditor priorYear={2026} {...props} lines={[lines[0]!, { ...planned, months: Array.from({ length: 12 }, () => "117250000") }]} />);
    expect(cell(1, 1).value).toBe("5.000");
    expect(cell(2, 1).value).toBe("117.250.000");
  });

  it("has no discussion for a line that is not saved yet", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Tambah baris/ }));
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
