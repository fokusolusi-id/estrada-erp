import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProvisionalCoa, type CoaOption } from "./provisional-coa";

const accounts: CoaOption[] = [
  { code: "4300", name: "Pendapatan Harwat Smart City", category: "Revenue", active: true, provisional: true, lines: 12 },
  { code: "5100-1", name: "Biaya Pembelian Perangkat Keras+Komponen", category: "CAPEX", active: true, provisional: true, lines: 1 },
  { code: "4200", name: "Pendapatan Harwat Smart City", category: "Revenue", active: true, provisional: false, lines: 0 },
  { code: "4100", name: "Pendapatan Sewa CPE", category: "Revenue", active: false, provisional: false, lines: 0 },
  { code: "6241", name: "Beban internet", category: "OPEX", active: true, provisional: false, lines: 3 },
];
const ok = () => vi.fn(async () => ({ ok: true, message: "Selesai." }));

describe("ProvisionalCoa", () => {
  it("lists only provisional codes, with the lines that use them", () => {
    render(<ProvisionalCoa accounts={accounts} onConfirm={ok()} onRemap={ok()} />);
    expect(screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0]!.textContent)).toEqual(["4300", "5100-1"]);
    expect(within(screen.getByTestId("provisional-4300")).getByText("12")).toBeTruthy();
  });

  it("offers only active, confirmed codes of the same category as remap targets", () => {
    render(<ProvisionalCoa accounts={accounts} onConfirm={ok()} onRemap={ok()} />);
    const select = screen.getByLabelText("Pindahkan 4300 ke");
    expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual(["", "4200"]);
    expect([...(screen.getByLabelText("Pindahkan 5100-1 ke") as HTMLSelectElement).options].map((o) => o.value)).toEqual([""]);
  });

  it("confirms or remaps through the given actions", async () => {
    const onConfirm = ok();
    const onRemap = ok();
    render(<ProvisionalCoa accounts={accounts} onConfirm={onConfirm} onRemap={onRemap} />);
    fireEvent.click(within(screen.getByTestId("provisional-5100-1")).getByRole("button", { name: "Konfirmasi" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("5100-1"));
    fireEvent.change(screen.getByLabelText("Pindahkan 4300 ke"), { target: { value: "4200" } });
    fireEvent.click(within(screen.getByTestId("provisional-4300")).getByRole("button", { name: "Pindahkan" }));
    await waitFor(() => expect(onRemap).toHaveBeenCalledWith("4300", "4200"));
  });
});
