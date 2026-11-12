import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { money } from "@estrada/domain";
import { PaymentRealisasi } from "./payment-realisasi";

const rows = [
  { id: "a", coaCode: "6241", coaName: "Beban internet", item: "Kontrak internet kantor", entity: "ESTRADA", ownerUnit: "SCM", plan: money("237855840"), paid: money("10000000"), committed: money("0") },
  { id: "b", coaCode: "6320", coaName: "Jasa profesional", item: null, entity: "ESTRADA", ownerUnit: "FRM", plan: money("1000"), paid: money("900"), committed: money("200") },
];

describe("PaymentRealisasi", () => {
  it("sets each line's plan beside what payments used and hold, with the share absorbed", () => {
    render(<PaymentRealisasi rows={rows} year={2027} />);
    const a = within(screen.getByTestId("realisasi-a")).getAllByRole("cell").map((c) => c.textContent);
    expect(a).toEqual(["6241 Kontrak internet kantor", "ESTRADA", "SCM", "Rp 237.855.840", "Rp 10.000.000", "–", "Rp 227.855.840", "4,2%"]);
  });

  it("marks an overspent line red and totals the lot", () => {
    render(<PaymentRealisasi rows={rows} year={2027} />);
    const sisa = within(screen.getByTestId("realisasi-b")).getAllByRole("cell")[6]!;
    expect(sisa.textContent).toBe("-Rp 100");
    expect(sisa.className).toContain("text-destructive");
    expect(screen.getByTestId("realisasi-total").textContent).toBe("Rp 10.000.900");
    expect(screen.getByRole("columnheader", { name: "RKA 2027" })).toBeTruthy();
  });
});
