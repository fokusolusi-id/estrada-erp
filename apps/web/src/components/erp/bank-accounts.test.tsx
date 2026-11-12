import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BankAccounts } from "./bank-accounts";

const accounts = [
  { id: "a1", entity: "ESTRADA", bankName: "BCA", accountNumber: "123-456-7890", accountName: "PT Estrada", active: true },
  { id: "a2", entity: "ESTRADA", bankName: "Mandiri", accountNumber: "9988776655", accountName: "PT Estrada", active: false },
  { id: "a3", entity: "PAS", bankName: "BNI", accountNumber: "5544", accountName: "PT PAS", active: true },
];

describe("BankAccounts: Bank asal for Cash Management", () => {
  it("lists accounts per entity and marks the inactive ones", () => {
    render(<BankAccounts accounts={accounts} entities={["ESTRADA", "PAS"]} onSave={vi.fn()} />);
    const estrada = screen.getByTestId("bank-entity-ESTRADA");
    expect(within(estrada).getAllByLabelText("Nama bank").map((i) => (i as HTMLInputElement).value)).toEqual(["BCA", "Mandiri"]);
    expect((within(estrada).getAllByLabelText("Aktif")[1] as HTMLInputElement).checked).toBe(false);
    expect(within(screen.getByTestId("bank-entity-PAS")).getAllByLabelText("Nama bank")).toHaveLength(1);
  });

  it("saves an edited account", async () => {
    const onSave = vi.fn(async () => ({ ok: true, message: "Rekening disimpan." }));
    render(<BankAccounts accounts={accounts} entities={["ESTRADA", "PAS"]} onSave={onSave} />);
    const row = screen.getByTestId("bank-a3");
    fireEvent.change(within(row).getByLabelText("Nomor rekening"), { target: { value: "5544-0001" } });
    fireEvent.click(within(row).getByRole("button", { name: "Simpan" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ id: "a3", entity: "PAS", bankName: "BNI", accountNumber: "5544-0001", accountName: "PT PAS", active: true }),
    );
    expect(await within(row).findByText("Rekening disimpan.")).toBeTruthy();
  });

  it("adds an account for the chosen entity", async () => {
    const onSave = vi.fn(async () => ({ ok: true, message: "Rekening ditambahkan." }));
    render(<BankAccounts accounts={[]} entities={["ESTRADA", "PAS"]} onSave={onSave} />);
    expect(screen.getByText("Belum ada rekening.")).toBeTruthy();
    const add = screen.getByTestId("bank-new");
    fireEvent.change(within(add).getByLabelText("Entitas"), { target: { value: "PAS" } });
    fireEvent.change(within(add).getByLabelText("Nama bank"), { target: { value: "BRI" } });
    fireEvent.change(within(add).getByLabelText("Nomor rekening"), { target: { value: "0011" } });
    fireEvent.change(within(add).getByLabelText("Atas nama"), { target: { value: "PT PAS" } });
    fireEvent.click(within(add).getByRole("button", { name: "Tambah" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ id: null, entity: "PAS", bankName: "BRI", accountNumber: "0011", accountName: "PT PAS", active: true }),
    );
  });

  it("shows the server's refusal", async () => {
    const onSave = vi.fn(async () => ({ ok: false, message: "Nomor rekening sudah terdaftar." }));
    render(<BankAccounts accounts={accounts} entities={["ESTRADA"]} onSave={onSave} />);
    fireEvent.click(within(screen.getByTestId("bank-a1")).getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Nomor rekening sudah terdaftar.")).toBeTruthy();
  });
});
