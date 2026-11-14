import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { KurvaS } from "./kurva-s";

describe("KurvaS", () => {
  it("shows planned and actual per month, with the gap, in red when behind", () => {
    render(
      <KurvaS
        points={[
          { month: "2027-01", planned: 25, actual: 25 },
          { month: "2027-02", planned: 75, actual: 33.3 },
          { month: "2027-03", planned: 100, actual: null },
        ]}
      />,
    );
    const feb = within(screen.getByTestId("curve-2027-02"));
    expect(feb.getByTestId("planned").textContent).toBe("75%");
    expect(feb.getByTestId("actual").textContent).toBe("33,3%");
    expect(feb.getByTestId("gap").textContent).toBe("-41,7");
    expect(feb.getByTestId("gap").className).toContain("text-destructive");
    expect(within(screen.getByTestId("curve-2027-03")).getByTestId("actual").textContent).toBe("–");
    expect(within(screen.getByTestId("curve-2027-01")).getByTestId("gap").textContent).toBe("0");
  });

  it("explains itself when there are no sites yet", () => {
    render(<KurvaS points={[]} />);
    expect(screen.getByText(/Kurva S terbentuk setelah lokasi terdaftar/)).toBeTruthy();
  });
});
