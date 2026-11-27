import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { money } from "@estrada/domain";
import { SpendingCard, WidgetCard } from "./home-widgets";

const rows = [
  { unit: "SCM", budget: money("2400"), actual: money("500"), committed: money("50"), remaining: money("1850"), utilisation: money("22.9"), runRate: money("3000"), flagged: true },
];

describe("Beranda cards", () => {
  afterEach(cleanup);

  it("lists budget, use and remainder per unit and marks a variance above 10%", () => {
    render(<SpendingCard title="Cost center" description="x" rows={rows} unit="rp" />);
    const row = within(screen.getByTestId("spend-SCM"));
    expect(row.getByText("22,9%")).toBeTruthy();
    expect(row.getByText("Varians > 10%")).toBeTruthy();
  });

  it("says so when there is nothing to show, and links to the detail only when given", () => {
    render(<SpendingCard title="RKA per divisi" description="x" rows={[]} unit="rp" />);
    expect(screen.getByText("Belum ada data.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    cleanup();
    render(<WidgetCard title="Pipeline" description="x" href="/pipeline">isi</WidgetCard>);
    expect(screen.getByRole("link", { name: /Rincian/ }).getAttribute("href")).toBe("/pipeline");
  });
});
