import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PaymentActions } from "./payment-actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const banks = [{ id: "b1", label: "BCA 123-456-7890 · PT Estrada" }];
const sent = (fn: ReturnType<typeof vi.fn>) => Object.fromEntries([...((fn.mock.calls[0] as unknown as [FormData])[0]).entries()].filter(([, v]) => typeof v === "string"));

describe("PaymentActions", () => {
  it("shows nothing when the viewer cannot act", () => {
    const { container } = render(<PaymentActions requestId="p1" actions={[]} banks={banks} today="2026-11-12" onRun={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("holds Submit until the request is complete", () => {
    render(<PaymentActions requestId="p1" actions={["submit"]} banks={banks} today="2026-11-12" missing={["Lampirkan minimal satu dokumen"]} onRun={vi.fn()} />);
    expect(screen.getByText("• Lampirkan minimal satu dokumen")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Kirim ke atasan" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets an approver approve, or return with a reason", async () => {
    const onRun = vi.fn(async () => ({ ok: true, message: "Permintaan dikembalikan ke pemohon." }));
    render(<PaymentActions requestId="p1" actions={["approve", "return"]} banks={banks} today="2026-11-12" onRun={onRun} />);
    expect(screen.getByRole("button", { name: "Setujui" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Kembalikan ke pemohon"), { target: { value: "Kurang BAST" } });
    fireEvent.submit(screen.getByRole("button", { name: "Kembalikan" }).closest("form")!);
    await waitFor(() => expect(onRun).toHaveBeenCalled());
    expect(sent(onRun)).toEqual({ comment: "Kurang BAST", requestId: "p1", action: "return" });
    expect(await screen.findByText("Permintaan dikembalikan ke pemohon.")).toBeTruthy();
  });

  it("names the BFP step for what it does", () => {
    render(<PaymentActions requestId="p1" actions={["verify", "return"]} banks={banks} today="2026-11-12" onRun={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Teruskan ke Head Divisi" })).toBeTruthy();
  });

  it("schedules with a date and a bank asal", async () => {
    const onRun = vi.fn(async () => ({ ok: true, message: "Pembayaran dijadwalkan." }));
    render(<PaymentActions requestId="p1" actions={["schedule"]} banks={banks} today="2026-11-12" onRun={onRun} />);
    expect((screen.getByLabelText("Tanggal jadwal") as HTMLInputElement).value).toBe("2026-11-12");
    fireEvent.change(screen.getByLabelText("Bank asal"), { target: { value: "b1" } });
    fireEvent.submit(screen.getByRole("button", { name: "Jadwalkan" }).closest("form")!);
    await waitFor(() => expect(onRun).toHaveBeenCalled());
    expect(sent(onRun)).toEqual({ scheduledOn: "2026-11-12", bankAccountId: "b1", requestId: "p1", action: "schedule" });
  });

  it("cannot schedule without an account for the entity", () => {
    render(<PaymentActions requestId="p1" actions={["schedule"]} banks={[]} today="2026-11-12" onRun={vi.fn()} />);
    expect(screen.getByText("Belum ada rekening untuk entitas ini")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Jadwalkan" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks for the payment date and the proof to mark Paid", () => {
    render(<PaymentActions requestId="p1" actions={["pay"]} banks={banks} today="2026-11-12" onRun={vi.fn()} />);
    expect((screen.getByLabelText("Bukti bayar") as HTMLInputElement).required).toBe(true);
    expect(screen.getByRole("button", { name: "Tandai sudah dibayar" })).toBeTruthy();
  });
});
