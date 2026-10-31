import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApprovalQueue, type QueueLine } from "./approval-queue";

const flat = (a: string) => Array.from({ length: 12 }, () => a);
const lines: QueueLine[] = [
  { id: "a", coaCode: "6241", coaName: "Beban internet", entity: "ESTRADA", requestorUnit: "SCM", ownerUnit: "SCM", state: "consolidation", months: flat("19821320"), basis: "Kontrak", actions: ["return", "consolidate"],
    history: [{ action: "submit", fromState: "draft", toState: "consolidation", actorName: "Rina (SCM)", actorRole: "Requestor", comment: null, at: "2026-10-31T02:01:00.000Z" }] },
  { id: "b", coaCode: "5300", coaName: "Biaya jaringan Internet", entity: "ESTRADA", requestorUnit: "SCM", ownerUnit: "SCM", state: "consolidation", months: flat("1000000"), actions: ["return", "consolidate"], actual2026: "10000000", flags: ["Nilai bulanan mengandung desimal"] },
  { id: "c", coaCode: "6211", coaName: "Beban Gaji", entity: "ESTRADA", requestorUnit: "FRM", ownerUnit: "HCM", state: "consolidation", months: flat("0"), actions: [] },
];

const setup = () => {
  const onAction = vi.fn(async () => ({ ok: true, message: "2 baris diproses." }));
  render(<ApprovalQueue lines={lines} unit="rp" onAction={onAction} />);
  return onAction;
};

describe("ApprovalQueue", () => {
  it("groups lines by budget owner unit with a subtotal", () => {
    setup();
    expect(screen.getByTestId("subtotal-SCM").textContent).toBe("Rp 249.855.840");
    expect(screen.getByTestId("subtotal-HCM").textContent).toBe("Rp 0");
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

  it("keeps the result visible after the queue empties", async () => {
    const onAction = vi.fn(async () => ({ ok: true, message: "2 baris diproses." }));
    const { rerender } = render(<ApprovalQueue lines={lines} unit="rp" onAction={onAction} />);
    fireEvent.click(screen.getByLabelText("Pilih semua SCM"));
    fireEvent.click(screen.getByRole("button", { name: "Kirim ke Division Owner" }));
    await screen.findByText("2 baris diproses.");
    rerender(<ApprovalQueue lines={[]} unit="rp" onAction={onAction} />);
    expect(screen.getByText("2 baris diproses.")).toBeTruthy();
    expect(screen.getByText("Tidak ada baris yang menunggu Anda.")).toBeTruthy();
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
});
