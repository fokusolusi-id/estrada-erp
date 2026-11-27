import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangeRequests, type ChangeRow } from "./change-requests";

const row = (over: Partial<ChangeRow> = {}): ChangeRow => ({
  id: "r1",
  title: "COA 6240 · Ubah",
  changes: [{ field: "Nama", before: "Lama", after: "Baru" }],
  reason: "Penyesuaian nama",
  effectiveOn: "27 Nov 2026",
  requester: "Dewi (Finance)",
  status: "pending",
  note: null,
  canDecide: true,
  canCancel: false,
  ...over,
});
const ok = () => vi.fn(async () => ({ ok: true, message: "Selesai." }));

describe("ChangeRequests", () => {
  afterEach(cleanup);

  it("shows what changes, why and from when", () => {
    render(<ChangeRequests rows={[row()]} onDecide={ok()} onCancel={ok()} />);
    const card = within(screen.getByTestId("change-r1"));
    expect(card.getByText("Lama")).toBeTruthy();
    expect(card.getByText("Baru")).toBeTruthy();
    expect(card.getByText(/Penyesuaian nama/)).toBeTruthy();
    expect(card.getByText("Menunggu persetujuan")).toBeTruthy();
  });

  it("approves, and rejects with the note typed", async () => {
    const onDecide = ok();
    render(<ChangeRequests rows={[row()]} onDecide={onDecide} onCancel={ok()} />);
    fireEvent.change(screen.getByLabelText("Catatan keputusan r1"), { target: { value: "Nama sudah dipakai" } });
    fireEvent.click(screen.getByRole("button", { name: "Tolak" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("r1", "reject", "Nama sudah dipakai"));
    await waitFor(() => expect((screen.getByRole("button", { name: "Setujui" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith("r1", "approve", "Nama sudah dipakai"));
  });

  it("offers no buttons to someone who may neither decide nor cancel", () => {
    render(<ChangeRequests rows={[row({ canDecide: false, status: "applied" })]} onDecide={ok()} onCancel={ok()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
