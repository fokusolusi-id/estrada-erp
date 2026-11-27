import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApprovalQueue, type QueueLine } from "./approval-queue";

const flat = (a: string) => Array.from({ length: 12 }, () => a);
const lines: QueueLine[] = [
  { id: "a", category: "OPEX", coaCode: "6241", coaName: "Beban internet", entity: "ESTRADA", requestorUnit: "SCM", ownerUnit: "SCM", state: "consolidation", months: flat("19821320"), basis: "Kontrak", actions: ["return", "consolidate"],
    history: [{ action: "submit", fromState: "draft", toState: "consolidation", actorName: "Rina (SCM)", actorRole: "Requestor", comment: null, at: "2026-10-31T02:01:00.000Z" }] },
  { id: "b", category: "Revenue", coaCode: "5300", coaName: "Biaya jaringan Internet", entity: "ESTRADA", requestorUnit: "SCM", ownerUnit: "SCM", state: "consolidation", months: flat("1000000"), actions: ["return", "consolidate"], priorActual: "10000000", flags: ["Nilai bulanan mengandung desimal"] },
  { id: "c", category: "OPEX", coaCode: "6211", coaName: "Beban Gaji", entity: "ESTRADA", requestorUnit: "FRM", ownerUnit: "HCM", state: "consolidation", months: flat("0"), actions: [] },
];

const setup = () => {
  const onAction = vi.fn(async () => ({ ok: true, message: "2 baris diproses." }));
  render(<ApprovalQueue priorYear={2026} lines={lines} unit="rp" onAction={onAction} />);
  return onAction;
};

describe("ApprovalQueue", () => {
  it("groups lines by budget owner unit, with revenue and cost subtotalled apart", () => {
    setup();
    expect(screen.getByTestId("subtotal-SCM-Revenue").textContent).toBe("Rp 12.000.000");
    expect(screen.getByTestId("subtotal-SCM-Cost").textContent).toBe("Rp 237.855.840");
    expect(screen.getByTestId("subtotal-HCM-Cost").textContent).toBe("Rp 0");
  });

  it("offers only actions every selected line allows", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Kirim ke Division Owner" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Pilih semua SCM"));
    expect(screen.getByRole("button", { name: "Kirim ke Division Owner" })).toBeTruthy();
    // Lines this position cannot act on are not selectable.
    expect((screen.getByLabelText("Pilih 6211 HCM") as HTMLInputElement).disabled).toBe(true);
  });

  it("sends the selected lines in one handoff", async () => {
    const onAction = setup();
    fireEvent.click(screen.getByLabelText("Pilih semua SCM"));
    fireEvent.click(screen.getByRole("button", { name: "Kirim ke Division Owner" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith(["a", "b"], "consolidate", undefined));
    expect(await screen.findByText("2 baris diproses.")).toBeTruthy();
  });

  it("requires a comment before returning lines", async () => {
    const onAction = setup();
    fireEvent.click(screen.getByLabelText("Pilih 6241 SCM"));
    fireEvent.click(screen.getByRole("button", { name: "Kembalikan" }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText("Catatan wajib diisi untuk aksi ini.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Catatan"), { target: { value: "Basis kurang rinci" } });
    fireEvent.click(screen.getByRole("button", { name: "Kembalikan" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith(["a"], "return", "Basis kurang rinci"));
  });

  it("lets a Division Owner send lines back to the Default Owner, and only with a note", async () => {
    const onAction = vi.fn(async () => ({ ok: true, message: "1 baris diproses." }));
    const division: QueueLine[] = [{ ...lines[0]!, state: "division_approval", actions: ["approve", "send_back"] }];
    render(<ApprovalQueue priorYear={2026} lines={division} unit="rp" onAction={onAction} />);
    fireEvent.click(screen.getByLabelText("Pilih semua SCM"));
    expect(screen.getByRole("button", { name: "Setujui & kirim ke Finance" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kembalikan" }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText("Catatan wajib diisi untuk aksi ini.")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Wajib untuk mengembalikan/), { target: { value: "Basis kontrak belum jelas" } });
    fireEvent.click(screen.getByRole("button", { name: "Kembalikan" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith(["a"], "send_back", "Basis kontrak belum jelas"));
  });

  it("keeps the result visible after the queue empties", async () => {
    const onAction = vi.fn(async () => ({ ok: true, message: "2 baris diproses." }));
    const { rerender } = render(<ApprovalQueue priorYear={2026} lines={lines} unit="rp" onAction={onAction} />);
    fireEvent.click(screen.getByLabelText("Pilih semua SCM"));
    fireEvent.click(screen.getByRole("button", { name: "Kirim ke Division Owner" }));
    await screen.findByText("2 baris diproses.");
    rerender(<ApprovalQueue priorYear={2026} lines={[]} unit="rp" onAction={onAction} />);
    expect(screen.getByText("2 baris diproses.")).toBeTruthy();
    expect(screen.getByText("Tidak ada baris yang menunggu Anda.")).toBeTruthy();
  });

  it("does not claim lines were processed when they have not arrived yet", () => {
    render(<ApprovalQueue priorYear={2026} lines={[]} upstream={192} unit="rp" onAction={vi.fn()} />);
    expect(screen.getByText(/192 baris masih di tahap sebelumnya/)).toBeTruthy();
    expect(screen.queryByText(/sudah diproses/)).toBeNull();
  });

  it("opens a line's history on request", () => {
    setup();
    expect(screen.queryByText(/Rina \(SCM\)/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Riwayat" })[0]!);
    expect(screen.getByText(/Rina \(SCM\)/)).toBeTruthy();
  });

  it("shows Actual 2026, the change and the workbook's review flags", () => {
    setup();
    expect(screen.getByText("+Rp 2.000.000 (+20,0%)")).toBeTruthy();
    expect(screen.getByText("Nilai bulanan mengandung desimal")).toBeTruthy();
  });

  it("filters by COA, offering only the codes in this position's queue and their parents; a parent shows its children", () => {
    const coa = [
      { code: "5300", name: "Biaya jaringan Internet", parentCode: null },
      { code: "6200", name: "Beban umum", parentCode: null },
      { code: "6210", name: "Beban Gaji dan Tunjangan", parentCode: "6200" },
      { code: "6211", name: "Beban Gaji", parentCode: "6210" },
      { code: "6240", name: "Beban Utilitas", parentCode: "6200" },
      { code: "6241", name: "Beban internet", parentCode: "6240" },
      { code: "6221", name: "Beban rekrutmen", parentCode: "6200" },
    ];
    render(<ApprovalQueue priorYear={2026} lines={lines} coa={coa} unit="rp" onAction={vi.fn()} />);
    const filter = screen.getByLabelText("Filter COA") as HTMLSelectElement;
    expect([...filter.options].map((o) => o.value)).toEqual(["", "5300", "6200", "6210", "6211", "6240", "6241"]);

    fireEvent.change(filter, { target: { value: "6200" } });
    expect(screen.getByLabelText("Pilih 6241 SCM")).toBeTruthy();
    expect(screen.getByLabelText("Pilih 6211 HCM")).toBeTruthy();
    expect(screen.queryByLabelText("Pilih 5300 SCM")).toBeNull();

    fireEvent.change(filter, { target: { value: "6240" } });
    expect(screen.queryByLabelText("Pilih 6211 HCM")).toBeNull();
    expect(screen.getByTestId("subtotal-SCM-Cost").textContent).toBe("Rp 237.855.840");
  });

  it("drops the selection when the filter changes, so hidden lines are never sent", () => {
    render(<ApprovalQueue priorYear={2026} lines={lines} coa={[]} unit="rp" onAction={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Pilih semua SCM"));
    fireEvent.change(screen.getByLabelText("Filter COA"), { target: { value: "6241" } });
    expect((screen.getByLabelText("Pilih 6241 SCM") as HTMLInputElement).checked).toBe(false);
  });

  it.each([
    ["finalize", "finance_review", "Finalisasi"],
    ["lock", "awaiting_lock", "Kunci versi"],
  ] as const)("asks for confirmation before %s", async (action, state, label) => {
    const onAction = vi.fn(async () => ({ ok: true, message: "2 baris diproses." }));
    render(<ApprovalQueue priorYear={2026} lines={lines.slice(0, 2).map((l) => ({ ...l, state, actions: [action] }))} unit="rp" onAction={onAction} />);
    fireEvent.click(screen.getByLabelText("Pilih semua SCM"));
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onAction).not.toHaveBeenCalled();
    const confirm = screen.getByRole("group", { name: `Konfirmasi ${label}` });
    expect(confirm.textContent).toContain("2 baris");
    expect(confirm.textContent).toContain("Pendapatan Rp 12.000.000");
    expect(confirm.textContent).toContain("Biaya Rp 237.855.840");
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.queryByRole("group", { name: `Konfirmasi ${label}` })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: label }));
    fireEvent.click(screen.getByRole("button", { name: `Ya, ${label}` }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith(["a", "b"], action, undefined));
  });

  it("drops a pending confirmation when the selection changes", () => {
    render(<ApprovalQueue priorYear={2026} lines={lines.slice(0, 2).map((l) => ({ ...l, state: "awaiting_lock", actions: ["lock"] }))} unit="rp" onAction={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Pilih semua SCM"));
    fireEvent.click(screen.getByRole("button", { name: "Kunci versi" }));
    fireEvent.click(screen.getByLabelText("Pilih 5300 SCM"));
    expect(screen.queryByRole("group", { name: "Konfirmasi Kunci versi" })).toBeNull();
  });
});
