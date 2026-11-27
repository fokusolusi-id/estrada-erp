import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

// BR-SCM-002 / plan A4: a payment can name its payee from Master Mitra.
describe("PaymentForm: Master Mitra", () => {
  const partners = [
    { id: "Mitra-001", name: "PT Lixa Teknologi Indonesia", npwp: "0435240478044000" },
    { id: "Mitra-004", name: "PT Integrasi Data Nusantara", npwp: null },
  ];
  const view = (onSave = vi.fn(async () => ({ ok: true, message: "Draft disimpan." }))) => {
    const { container } = render(<PaymentForm initial={EMPTY_PAYMENT} entities={["ESTRADA"]} lines={lines} partners={partners} onSave={onSave} />);
    const form = within(container);
    const pick = (id: string) => fireEvent.change(form.getByLabelText("Mitra (Master Mitra)"), { target: { value: id } });
    const input = (label: string) => form.getByLabelText(label) as HTMLInputElement;
    return { form, pick, input, onSave };
  };

  it("fills the payee from the picked partner and saves the link", async () => {
    const { form, pick, input, onSave } = view();
    fireEvent.change(input("Bank tujuan"), { target: { value: "BCA" } });
    pick("Mitra-001");
    expect(input("Dibayar kepada").value).toBe("PT Lixa Teknologi Indonesia");
    expect(input("Dibayar kepada").readOnly).toBe(true);
    expect(input("Bank tujuan").value).toBe("BCA");
    fireEvent.click(form.getByRole("button", { name: "Simpan draft" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ partnerId: "Mitra-001", payeeName: "PT Lixa Teknologi Indonesia" })));
  });

  it("drops the previous partner's bank account when another partner is picked", () => {
    const { pick, input } = view();
    pick("Mitra-001");
    fireEvent.change(input("Nomor rekening tujuan"), { target: { value: "123" } });
    pick("Mitra-004");
    expect(input("Nomor rekening tujuan").value).toBe("");
  });

  it("warns when the partner has no NPWP (BR-MD-005), and frees the name when unpicked", () => {
    const { form, pick, input } = view();
    pick("Mitra-004");
    expect(form.getByText(/belum punya NPWP/)).toBeTruthy();
    pick("");
    expect(form.queryByText(/belum punya NPWP/)).toBeNull();
    expect(input("Dibayar kepada").readOnly).toBe(false);
  });
});
