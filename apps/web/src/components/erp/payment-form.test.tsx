import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EMPTY_PAYMENT, PaymentForm } from "./payment-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const lines = [
  { id: "l1", entity: "ESTRADA", label: "6241 · Beban internet · Kontrak internet (SCM)" },
  { id: "l2", entity: "PAS", label: "6320 · Jasa profesional (SCM)" },
];

describe("PaymentForm", () => {
  it("offers only the chosen entity's RKA lines and clears the line when the entity changes", () => {
    render(<PaymentForm initial={EMPTY_PAYMENT} entities={["ESTRADA", "PAS"]} lines={lines} onSave={vi.fn()} />);
    const line = screen.getByLabelText("Baris RKA") as HTMLSelectElement;
    expect([...line.options].map((o) => o.value)).toEqual(["", "l1"]);
    fireEvent.change(line, { target: { value: "l1" } });
    fireEvent.change(screen.getByLabelText("Entitas"), { target: { value: "PAS" } });
    expect(line.value).toBe("");
    expect([...line.options].map((o) => o.value)).toEqual(["", "l2"]);
  });

  it("works out the nett as it is typed, in id-ID figures", () => {
    render(<PaymentForm initial={EMPTY_PAYMENT} entities={["ESTRADA"]} lines={lines} onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Nominal (DPP)"), { target: { value: "10.000.000" } });
    fireEvent.change(screen.getByLabelText("PPN"), { target: { value: "1.100.000" } });
    fireEvent.change(screen.getByLabelText("PPh dipotong"), { target: { value: "200.000" } });
    expect(screen.getByTestId("payment-nett").textContent).toContain("Rp 10.900.000");
    fireEvent.change(screen.getByLabelText("PPN"), { target: { value: "abc" } });
    expect(screen.getByTestId("payment-nett").textContent).toContain("angka tidak terbaca");
  });

  it("saves the draft and opens it", async () => {
    const onSave = vi.fn(async () => ({ ok: true, message: "Draft disimpan.", id: "p9" }));
    render(<PaymentForm initial={EMPTY_PAYMENT} entities={["ESTRADA"]} lines={lines} onSave={onSave} />);
    fireEvent.click(screen.getByLabelText("Cash Advance (CA)"));
    fireEvent.change(screen.getByLabelText("Deskripsi pembayaran"), { target: { value: "CA perjalanan dinas" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan draft" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: "cash_advance", entity: "ESTRADA", description: "CA perjalanan dinas" })));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pembayaran/p9"));
  });

  it("shows the server's refusal", async () => {
    render(<PaymentForm initial={EMPTY_PAYMENT} entities={["ESTRADA"]} lines={lines} onSave={async () => ({ ok: false, message: "Nominal tidak terbaca." })} />);
    fireEvent.click(screen.getByRole("button", { name: "Simpan draft" }));
    expect(await screen.findByText("Nominal tidak terbaca.")).toBeTruthy();
  });
});
