import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { BaiKpiRow } from "@estrada/domain";
import { BaiKpi } from "./bai-kpi";

const row = (over: Partial<BaiKpiRow> = {}): BaiKpiRow => ({ total: 0, onTime: 0, late: 0, waiting: 0, pct: null, averageDays: null, ...over });

describe("BaiKpi", () => {
  it("shows each holder's timeliness against the 7, 5 and 3 day targets", () => {
    render(<BaiKpi kpi={{ collect: row({ total: 3, onTime: 2, late: 1, pct: 66.7, averageDays: 6.3 }), compile: row({ total: 3, onTime: 3, pct: 100, averageDays: 3 }), verify: row({ total: 1, waiting: 1 }) }} />);
    const collect = within(screen.getByTestId("kpi-collect"));
    expect(collect.getByText("Delivery Control")).toBeTruthy();
    expect(collect.getByText("7 hari")).toBeTruthy();
    expect(collect.getByTestId("pct").textContent).toBe("66,7%");
    expect(collect.getByText("6,3 hari")).toBeTruthy();
    expect(within(screen.getByTestId("kpi-compile")).getByText("5 hari")).toBeTruthy();
    expect(within(screen.getByTestId("kpi-verify")).getByText("3 hari")).toBeTruthy();
    expect(within(screen.getByTestId("kpi-verify")).getByTestId("pct").textContent).toBe("–");
  });

  it("says so when no BAI has been recorded", () => {
    render(<BaiKpi kpi={{ collect: row(), compile: row(), verify: row() }} />);
    expect(screen.getByText("Belum ada BAI yang dicatat.")).toBeTruthy();
  });
});
