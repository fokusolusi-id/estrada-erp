import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { legendText, tooltipEntry, TOOLTIP_ITEM } from "./charts";

describe("legendText", () => {
  it("writes legend labels in the text colour, leaving the series colour to the marker", () => {
    render(<>{legendText("Total Biaya")}</>);
    expect(screen.getByText("Total Biaya").className).toContain("text-foreground");
  });
});

describe("chart tooltip", () => {
  it("names each series beside its figure, so colour is not the only key", () => {
    expect(tooltipEntry(1, "Rp juta")(16423.8, "Pendapatan")).toEqual(["16.423,8 Rp juta", "Pendapatan"]);
  });

  it("writes entries in the popover's text colour, not the series colour", () => {
    expect(TOOLTIP_ITEM.color).toBe("var(--popover-foreground)");
  });
});
