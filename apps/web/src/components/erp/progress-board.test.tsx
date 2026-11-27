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
  it("shows each division's lines per state, a dash where there are none, and how much is final", () => {
    render(<ProgressBoard rows={rows} />);
    const pdms = within(screen.getByTestId("progress-PDMS"));
    expect(pdms.getByTestId("state-draft").textContent).toBe("1");
    expect(pdms.getByTestId("state-consolidation").textContent).toBe("–");
    expect(pdms.getByTestId("final").textContent).toBe("33%");
    expect(within(screen.getByTestId("progress-total")).getByTestId("state-locked").textContent).toBe("2");
  });

  it("links each non-empty count to the lines behind it", () => {
    render(<ProgressBoard rows={rows} hrefFor={(division, state) => `/rka?divisi=${division}&status=${state}`} />);
    const pdms = within(screen.getByTestId("progress-PDMS"));
    expect(pdms.getByRole("link", { name: "1 baris PDMS Draft" }).getAttribute("href")).toBe("/rka?divisi=PDMS&status=draft");
    expect(pdms.queryByRole("link", { name: /Konsolidasi/ })).toBeNull();
  });

  it("says so when the cycle has no lines", () => {
    render(<ProgressBoard rows={[]} />);
    expect(screen.getByText("Belum ada baris RKA di siklus ini.")).toBeTruthy();
  });
});
