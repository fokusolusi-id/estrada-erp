import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PeriodBoard } from "./period-board";

const periods = [{ entity: "ESTRADA", month: 1, status: "closed" as const, note: "Ditutup Dewi" }];
const ok = () => vi.fn(async () => ({ ok: true, message: "Periode disimpan." }));
const view = (props: Partial<Parameters<typeof PeriodBoard>[0]> = {}) =>
  render(<PeriodBoard year={2027} entities={["ESTRADA"]} periods={periods} mayClose mayReopen onChange={ok()} {...props} />);

describe("PeriodBoard", () => {
  afterEach(cleanup);

  it("shows twelve months, open unless recorded otherwise", () => {
    view();
    expect(screen.getAllByRole("row")).toHaveLength(13);
    expect(within(screen.getByTestId("period-ESTRADA-1")).getByText("Ditutup")).toBeTruthy();
    expect(within(screen.getByTestId("period-ESTRADA-2")).getByText("Terbuka")).toBeTruthy();
  });

  it("starts closing an open month", async () => {
    const onChange = ok();
    view({ onChange });
    fireEvent.click(within(screen.getByTestId("period-ESTRADA-2")).getByRole("button", { name: "Mulai penutupan" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("ESTRADA", 2027, 2, "start_closing", ""));
  });

  it("asks for a reason before reopening", async () => {
    const onChange = ok();
    view({ onChange });
    const cell = within(screen.getByTestId("period-ESTRADA-1"));
    fireEvent.click(cell.getByRole("button", { name: "Buka kembali" }));
    fireEvent.change(cell.getByLabelText("Alasan membuka kembali"), { target: { value: "Koreksi" } });
    fireEvent.click(cell.getByRole("button", { name: "Konfirmasi" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("ESTRADA", 2027, 1, "reopen", "Koreksi"));
  });

  it("offers nothing to a reader", () => {
    view({ mayClose: false, mayReopen: false });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
