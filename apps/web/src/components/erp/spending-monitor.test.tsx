import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { budgetMonitor, money, plainMonitor } from "@estrada/domain";
import { SpendingMonitor } from "./spending-monitor";

const year = (amount: string) => Array.from({ length: 12 }, () => money(amount));
const data = budgetMonitor(
  [{ id: "a", unit: "SCM", coaCode: "6241", coaName: "Internet", category: "OPEX", months: year("100") }],
  [{ lineId: "a", state: "paid", gross: money("1170"), paidOn: "2026-02-10" }],
  [],
  { year: 2026, asOf: "2026-06-30", period: "ytd" },
);

describe("SpendingMonitor (36_Budget_Monitoring)", () => {
  afterEach(cleanup);

  it("shows each unit's use and status, and opens its accounts", () => {
    render(<SpendingMonitor units={plainMonitor(data.units)} unit="rp" />);
    const row = within(screen.getByTestId("monitor-SCM"));
    expect(row.getByText("97,5%")).toBeTruthy();
    expect(row.getByText("Melebihi")).toBeTruthy();
    expect(screen.queryByTestId("monitor-SCM-6241")).toBeNull();
    fireEvent.click(row.getByRole("button", { name: /SCM/ }));
    expect(screen.getByTestId("monitor-SCM-6241").textContent).toContain("6241 · Internet");
  });

  it("says so when there is no budget to monitor", () => {
    render(<SpendingMonitor units={[]} unit="rp" />);
    expect(screen.getByText("Belum ada anggaran biaya dalam cakupan Anda.")).toBeTruthy();
  });
});
