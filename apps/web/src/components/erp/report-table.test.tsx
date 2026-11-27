import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { money } from "@estrada/domain";
import { ReportTable } from "./report-table";

describe("ReportTable", () => {
  it("puts the year total next to the label, so it is never off-screen", () => {
    const months = Array.from({ length: 12 }, () => money("1"));
    render(<ReportTable testIdPrefix="r" unit="rp" rows={[{ key: "a", label: "Pendapatan", months, total: money("12") }]} />);
    expect(screen.getAllByRole("columnheader").slice(1, 3).map((h) => h.textContent)).toEqual(["Total", "Jan"]);
    expect(screen.getByTestId("r-a").children[1]!.getAttribute("data-testid")).toBe("total");
  });
});
