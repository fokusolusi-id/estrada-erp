import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { money } from "@estrada/domain";
import { BudgetGrid, type GridLine } from "./budget-grid";

const flat = (a: string) => Array.from({ length: 12 }, () => money(a));

const lines: GridLine[] = [
  { id: "a", coaCode: "6241", coaName: "Beban internet", entity: "ESTRADA", requestorUnit: "SCM", ownerUnit: "SCM", months: flat("19821320"), state: "draft" },
  { id: "b", coaCode: "6243", coaName: "Beban telekomunikasi", entity: "ESTRADA", requestorUnit: "SCM", ownerUnit: "SCM", months: flat("1648000"), state: "consolidation" },
];

describe("BudgetGrid", () => {
  it("computes each line total from the 12 months", () => {
    render(<BudgetGrid lines={lines} unit="rp" />);
    expect(screen.getByTestId("total-a").textContent).toBe("Rp 237.855.840");
  });

  it("shows a grand total across lines", () => {
    render(<BudgetGrid lines={lines} unit="rp" />);
    expect(screen.getByTestId("grand-total").textContent).toBe("Rp 257.631.840");
  });

  it("labels approval state in Bahasa Indonesia", () => {
    render(<BudgetGrid lines={lines} />);
    expect(screen.getByText("Konsolidasi")).toBeTruthy();
  });
});
