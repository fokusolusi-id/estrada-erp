import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { money } from "@estrada/domain";
import { PaymentRecapTable } from "./payment-recap-table";

const row = (id: string, paidOn: string, nett: string, bank: string) => ({ id, number: `PP/ESTRADA/2026/11/000${id}`, entity: "ESTRADA", paidOn, description: `Bayar ${id}`, nett: money(nett), bank });

describe("PaymentRecapTable", () => {
  it("subtotals each period, totals the whole, and each bank asal", () => {
    render(
      <PaymentRecapTable
        recap={{
          groups: [
            { key: "2026-11-03", label: "Selasa, 3 November 2026", rows: [row("1", "2026-11-03", "1000", "BCA 1"), row("2", "2026-11-03", "250.50", "Mandiri 9")], total: money("1250.50") },
            { key: "2026-11-15", label: "Minggu, 15 November 2026", rows: [row("3", "2026-11-15", "4000", "BCA 1")], total: money("4000") },
          ],
          byBank: [
            { bank: "BCA 1", total: money("5000") },
            { bank: "Mandiri 9", total: money("250.50") },
          ],
          total: money("5250.50"),
        }}
      />,
    );
    expect(screen.getByTestId("recap-subtotal-2026-11-03").textContent).toBe("Rp 1.250,50");
    expect(within(screen.getByTestId("recap-group-2026-11-03")).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByTestId("recap-total").textContent).toBe("Rp 5.250,50");
    expect(within(screen.getByRole("list", { name: "Total per bank asal" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["BCA 1Rp 5.000", "Mandiri 9Rp 250,50"]);
    expect(screen.getByRole("link", { name: "PP/ESTRADA/2026/11/0003" }).getAttribute("href")).toBe("/pembayaran/3");
  });
});
