import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CashAssumptions, type AssumptionsInput } from "./cash-assumptions";

// Forecast CF Bulanan 2027's ASUMSI block and ESTRADA's opening position.
const initial: AssumptionsInput = {
  collectionLag: "2",
  cogsPaymentLag: "1",
  taxRate: "22",
  minimumCash: "7000000000",
  interestCoa: "7220, 7221",
  nonCashCoa: "6291",
  openings: {
    ESTRADA: { cash: "4054912335.9", receivables: "20823092606.29", payables: "8891995641.74", priorYearTax: "8332260170.18", minimumCash: "7000000000" },
    MATRIK: { cash: "", receivables: "", payables: "", priorYearTax: "", minimumCash: "" },
  },
};

describe("CashAssumptions", () => {
  it("shows the rules and each entity's opening in rupiah, and saves plain decimals", async () => {
    const onSave = vi.fn(async () => ({ ok: true, message: "Asumsi disimpan." }));
    render(<CashAssumptions initial={initial} editable onSave={onSave} />);
    expect((screen.getByLabelText("Saldo kas awal ESTRADA") as HTMLInputElement).value).toBe("4.054.912.335,90");
    fireEvent.change(screen.getByLabelText("Lag penagihan (bulan)"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Saldo kas awal MATRIK"), { target: { value: "1.500.000.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan asumsi" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          collectionLag: 3,
          cogsPaymentLag: 1,
          taxRate: "0.22",
          minimumCash: "7000000000",
          interestCoa: ["7220", "7221"],
          openings: expect.objectContaining({ MATRIK: { cash: "1500000000", receivables: "0", payables: "0", priorYearTax: "0", minimumCash: "0" } }),
        }),
      ),
    );
    expect(await screen.findByText("Asumsi disimpan.")).toBeTruthy();
  });

  it("blocks text it cannot read, and is read-only for readers", () => {
    const { unmount } = render(<CashAssumptions initial={initial} editable onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Tarif PPh Badan (%)"), { target: { value: "dua puluh" } });
    expect((screen.getByRole("button", { name: "Simpan asumsi" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    render(<CashAssumptions initial={initial} editable={false} onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Simpan asumsi" })).toBeNull();
    expect((screen.getByLabelText("Lag penagihan (bulan)") as HTMLInputElement).disabled).toBe(true);
  });
});
