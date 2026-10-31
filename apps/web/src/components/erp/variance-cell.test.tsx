import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { money } from "@estrada/domain";
import { VarianceCell } from "./variance-cell";

describe("VarianceCell", () => {
  it("shows the change and percent against the 2026 figure", () => {
    render(<VarianceCell plan={money("133750032")} base={money("127920227")} unit="rp" />);
    expect(screen.getByTestId("variance").textContent).toBe("+Rp 5.829.805 (+4,6%)");
    expect(screen.getByTestId("variance").getAttribute("data-swing")).toBe("false");
  });

  it("marks a swing of 20% or more for a closer look", () => {
    render(<VarianceCell plan={money("600")} base={money("1000")} unit="rp" />);
    expect(screen.getByTestId("variance").textContent).toBe("-Rp 400 (-40,0%)");
    expect(screen.getByTestId("variance").getAttribute("data-swing")).toBe("true");
  });

  it("says when there is no 2026 figure", () => {
    render(<VarianceCell plan={money("600")} base={null} unit="rp" />);
    expect(screen.getByTestId("variance").textContent).toBe("Baru");
  });
});
