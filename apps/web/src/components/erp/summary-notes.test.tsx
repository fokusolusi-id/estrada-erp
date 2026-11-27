import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { money, pnl } from "@estrada/domain";
import { DraftNotice, ProfitReconciliation } from "./summary-notes";

const flat = (a: string) => Array.from({ length: 12 }, () => money(a));
const line = (category: "Revenue" | "OPEX" | "CAPEX", a: string) => ({ category, ownerUnit: "SCM", entity: "ESTRADA", months: flat(a) });

describe("ProfitReconciliation", () => {
  it("shows how revenue, total cost and CAPEX arrive at profit", () => {
    render(<ProfitReconciliation rows={pnl([line("Revenue", "10"), line("OPEX", "2"), line("CAPEX", "3")])} unit="rp" />);
    expect(screen.getByTestId("profit-formula").textContent).toBe("Laba Sebelum Pajak Rp 96 = Pendapatan Rp 120 − (Total Biaya Rp 60 − CAPEX Rp 36).");
  });
});

describe("DraftNotice", () => {
  it("warns that the figures include lines not yet final", () => {
    render(<DraftNotice pending={187} total={193} />);
    expect(screen.getByRole("alert").textContent).toBe("Angka ini termasuk 187 dari 193 baris yang belum final.");
  });

  it("says nothing when every line is final", () => {
    render(<DraftNotice pending={0} total={193} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
