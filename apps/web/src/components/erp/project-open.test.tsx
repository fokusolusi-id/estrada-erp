import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectOpen, type AwaitingDeal } from "./project-open";

// Sheet 41_Pipeline_Projek_Sync: a deal at Won Bidding (or signed) must have a project.
const deals: AwaitingDeal[] = [
  { id: "a", name: "SBST Korlantas", customer: "Telkom", entity: "ESTRADA", fiscalYear: 2027, status: "WB", value: "577320000", canOpen: true },
  { id: "b", name: "Jarkom NTMC", customer: "Telkom", entity: "ESTRADA", fiscalYear: 2027, status: "CW", value: "17417640000", canOpen: false },
];

describe("ProjectOpen: control list of won deals without a project", () => {
  afterEach(cleanup);

  it("shows each deal's status and value excluding PPN", () => {
    render(<ProjectOpen deals={deals} onOpen={vi.fn()} />);
    const row = within(screen.getByTestId("awaiting-a"));
    expect(row.getByText("Won Bidding")).toBeTruthy();
    expect(row.getByText("Rp 577.320.000")).toBeTruthy();
    expect(within(screen.getByTestId("awaiting-b")).getByText("Dibuka oleh BCD")).toBeTruthy();
  });

  it("opens a project for a Won Bidding deal", async () => {
    const onOpen = vi.fn(async () => ({ ok: true, message: "Proyek dibuka." }));
    render(<ProjectOpen deals={deals} onOpen={onOpen} />);
    fireEvent.change(screen.getByLabelText("Jumlah lokasi kontrak SBST Korlantas"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Buka proyek" }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("a", 3));
  });
});
