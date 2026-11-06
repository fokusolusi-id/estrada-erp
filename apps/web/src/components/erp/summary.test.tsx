import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { contribution, money, pnl, type SummaryLine } from "@estrada/domain";
import { PnlTable } from "./pnl-table";
import { ContributionTable } from "./contribution-table";
import { KpiCard } from "./kpi-card";
import { ScopeBar } from "./scope-bar";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/summary",
  useSearchParams: () => new URLSearchParams("status=all"),
}));

const flat = (a: string) => Array.from({ length: 12 }, () => money(a));
const lines: SummaryLine[] = [
  { category: "Revenue", ownerUnit: "BCD", entity: "ESTRADA", months: flat("1000000") },
  { category: "COGS", ownerUnit: "PMO", entity: "ESTRADA", months: flat("400000") },
  { category: "OPEX", ownerUnit: "SCM", entity: "MATRIK", months: flat("700000") },
];

describe("PnlTable", () => {
  it("labels rows in Bahasa Indonesia and keeps the team's terms", () => {
    render(<PnlTable rows={pnl(lines)} unit="rp" />);
    for (const label of ["Pendapatan", "COGS", "Laba Kotor", "OPEX", "Laba Sebelum Pajak", "CAPEX", "Total Biaya"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("marks computed rows like the workbook's formula cells", () => {
    render(<PnlTable rows={pnl(lines)} unit="rp" />);
    expect(screen.getByTestId("pnl-GrossProfit").getAttribute("data-derived")).toBe("true");
    expect(screen.getByTestId("pnl-Revenue").getAttribute("data-derived")).toBe("false");
  });

  it("names the unit once in the header and shows bare figures, with a loss in brackets and red", () => {
    render(<PnlTable rows={pnl(lines)} unit="rp" />);
    expect(screen.getByRole("columnheader", { name: /Uraian \(Rp\)/ })).toBeTruthy();
    expect(within(screen.getByTestId("pnl-Revenue")).getByTestId("total").textContent).toBe("12.000.000");
    const loss = within(screen.getByTestId("pnl-OperatingProfit")).getByTestId("total");
    expect(loss.textContent).toBe("(1.200.000)");
    expect(loss.querySelector(".text-destructive")).toBeTruthy();
  });

  it("keeps costs out of red and shows a dash for an empty row", () => {
    render(<PnlTable rows={pnl(lines)} unit="juta" />);
    expect(within(screen.getByTestId("pnl-COGS")).getByTestId("total").querySelector(".text-destructive")).toBeNull();
    expect(within(screen.getByTestId("pnl-CAPEX")).getByTestId("total").textContent).toBe("–");
  });
});

describe("ContributionTable", () => {
  it("lists each group's revenue, cost, net and share of total cost", () => {
    render(<ContributionTable rows={contribution(lines, (l) => l.entity)} unit="rp" label="Entitas" />);
    const matrik = screen.getByTestId("contribution-MATRIK");
    expect(screen.getByRole("columnheader", { name: /Total Biaya \(Rp\)/ })).toBeTruthy();
    expect(within(matrik).getByTestId("cost").textContent).toBe("8.400.000");
    expect(within(matrik).getByTestId("share").textContent).toBe("63,6%");
    expect(screen.getByTestId("contribution-total-cost").textContent).toBe("13.200.000");
  });
});

describe("KpiCard", () => {
  it("shows one number with its note", () => {
    render(<KpiCard label="Pendapatan" value={money("12000000")} unit="rp" note="Rencana invoice" />);
    expect(screen.getByText("Rp 12.000.000")).toBeTruthy();
    expect(screen.getByText("Rencana invoice")).toBeTruthy();
  });
});

describe("ScopeBar", () => {
  it("keeps filters in the URL so a view can be shared", () => {
    render(
      <ScopeBar
        filters={[
          { name: "entity", label: "Entitas", options: [{ value: "", label: "Semua entitas" }, { value: "MATRIK", label: "MATRIK" }] },
          { name: "status", label: "Status", options: [{ value: "all", label: "Semua status" }, { value: "final", label: "Final" }] },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Entitas"), { target: { value: "MATRIK" } });
    expect(replace).toHaveBeenCalledWith("/summary?status=all&entity=MATRIK");
    fireEvent.change(screen.getByLabelText("Entitas"), { target: { value: "" } });
    expect(replace).toHaveBeenLastCalledWith("/summary?status=all");
  });
});
