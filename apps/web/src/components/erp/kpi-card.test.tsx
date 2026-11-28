// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { money } from "@estrada/domain";
import { KpiCard } from "./kpi-card";

describe("KpiCard", () => {
  afterEach(cleanup);

  it("says there is no data instead of showing an unrecorded zero as a result", () => {
    render(<KpiCard label="Pendapatan" value={money("0")} unit="juta" missing="Belum ada baris pendapatan." trend={[0, 0]} />);
    expect(screen.getByText("Belum ada data")).toBeTruthy();
    expect(screen.getByText("Belum ada baris pendapatan.")).toBeTruthy();
    expect(screen.queryByText(/Rp/)).toBeNull();
  });

  it("keeps a recorded zero as a figure", () => {
    render(<KpiCard label="CAPEX" value={money("0")} unit="juta" />);
    expect(screen.getByText("Rp 0,0 jt")).toBeTruthy();
  });

  it("leaves the trend line out on a phone, so the figures come sooner", () => {
    const { container } = render(<KpiCard label="Pendapatan" value={money("1000000")} trend={[1, 2]} />);
    expect(container.querySelector("[data-trend]")?.className).toContain("max-sm:hidden");
  });
});
