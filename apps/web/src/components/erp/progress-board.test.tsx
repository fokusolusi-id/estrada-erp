import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { cycleProgress } from "@estrada/domain";
import { ProgressBoard } from "./progress-board";

const rows = cycleProgress(
  [
    { ownerUnit: "SCM", state: "draft" },
    { ownerUnit: "SCM", state: "finance_review" },
    { ownerUnit: "SCM", state: "locked" },
    { ownerUnit: "BCD", state: "locked" },
  ],
  (u) => ({ SCM: "PDMS" })[u] ?? u,
);

describe("ProgressBoard", () => {
  it("walks the six stages in order with who holds each and how many lines sit there", () => {
    render(<ProgressBoard rows={rows} />);
    const steps = within(screen.getByTestId("progress-total"));
    expect(steps.getAllByRole("listitem").map((li) => li.dataset.state)).toEqual(["draft", "consolidation", "division_approval", "finance_review", "awaiting_lock", "locked"]);
    expect(steps.getByTestId("state-locked").textContent).toBe("2");
    expect(steps.getByTestId("state-consolidation").textContent).toBe("–");
    expect(steps.getByText("Default Owner")).toBeTruthy();
    expect(screen.getByTestId("final-all").textContent).toBe("50%");
  });

  it("draws each division as one bar split by stage, with how much is final", () => {
    render(<ProgressBoard rows={rows} />);
    const pdms = screen.getByTestId("progress-PDMS");
    expect(within(pdms).getByRole("img").getAttribute("aria-label")).toBe("PDMS: Draft 1, Review Finance 1, Terkunci 1");
    expect(within(pdms).getByTestId("final").textContent).toBe("33%");
  });

  it("says so when the cycle has no lines", () => {
    render(<ProgressBoard rows={[]} />);
    expect(screen.getByText("Belum ada baris RKA di siklus ini.")).toBeTruthy();
  });
});
