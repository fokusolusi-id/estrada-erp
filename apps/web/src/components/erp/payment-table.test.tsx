import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PaymentTable } from "./payment-table";

const rows = [
  { id: "p1", number: "PP/ESTRADA/2026/11/0001", date: "2026-11-03", description: "Sewa server Oktober", entity: "ESTRADA", requester: "Rina", nett: "10900000", state: "under_review" as const },
  { id: "p2", number: null, date: "2026-11-05", description: "", entity: "PAS", requester: "Rina", nett: "0", state: "draft" as const },
];

describe("PaymentTable", () => {
  it("lists each request with its number, nett amount and status, linking to it", () => {
    render(<PaymentTable rows={rows} empty={<p>Kosong</p>} />);
    const [, first, second] = screen.getAllByRole("row");
    expect(within(first!).getByRole("link", { name: "PP/ESTRADA/2026/11/0001" }).getAttribute("href")).toBe("/pembayaran/p1");
    expect(within(first!).getByText("3 Nov 2026")).toBeTruthy();
    expect(within(first!).getByText("Rp 10.900.000")).toBeTruthy();
    expect(within(first!).getByText("Under Review")).toBeTruthy();
    expect(within(second!).getByRole("link", { name: "Draft" })).toBeTruthy();
    expect(within(second!).getByText("Tanpa deskripsi")).toBeTruthy();
  });

  it("shows the empty state when there is nothing", () => {
    render(<PaymentTable rows={[]} empty={<p>Belum ada permintaan.</p>} />);
    expect(screen.getByText("Belum ada permintaan.")).toBeTruthy();
  });
});
