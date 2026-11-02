import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActualEntry, type ActualLine } from "./actual-entry";

// Demo lines from the Project Delivery & Managed Serv sheet; 2026 actuals as Finance would type them.
const lines: ActualLine[] = [
  { id: "a", coaCode: "6241", coaName: "Beban internet", entity: "ESTRADA", ownerUnit: "SCM", plan: "237855840", rka2026: "200000000", actual2026: "180000000" },
  { id: "b", coaCode: "5300", coaName: "Biaya jaringan Internet", entity: "ESTRADA", ownerUnit: "SCM", plan: "4688241884.04" },
  { id: "c", coaCode: "6211", coaName: "Beban Gaji", item: "Gaji staf", entity: "ESTRADA", ownerUnit: "HCM", plan: "0" },
];
const ok = () => vi.fn(async () => ({ ok: true, message: "2 baris disimpan." }));
const input = (n: number) => screen.getByLabelText(`Actual 2026 baris ${n}`) as HTMLInputElement;

describe("ActualEntry", () => {
  it("shows each line's actual in rupiah and how the 2027 plan compares", () => {
    render(<ActualEntry lines={lines} onSave={ok()} />);
    expect(input(1).value).toBe("180.000.000");
    expect(input(2).value).toBe("");
    expect(screen.getByTestId("actual-change-1").textContent).toContain("Rp 57.855.840");
  });

  it("pastes a column copied from Excel down the rows, and saves only what changed as plain decimals", async () => {
    const onSave = ok();
    render(<ActualEntry lines={lines} onSave={onSave} />);
    fireEvent.paste(input(2), { clipboardData: { getData: () => "4.100.000.000,50\r\n12.000.000\r\n" } });
    expect([input(2).value, input(3).value]).toEqual(["4.100.000.000,50", "12.000.000"]);
    fireEvent.click(screen.getByRole("button", { name: "Simpan (2)" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith([
        { id: "b", actual: "4100000000.5" },
        { id: "c", actual: "12000000" },
      ]),
    );
    expect(await screen.findByText("2 baris disimpan.")).toBeTruthy();
  });

  it("clears an actual when the cell is emptied, and blocks saving text it cannot read", async () => {
    const onSave = ok();
    render(<ActualEntry lines={lines} onSave={onSave} />);
    fireEvent.change(input(1), { target: { value: "" } });
    fireEvent.change(input(2), { target: { value: "empat miliar" } });
    expect(input(2).getAttribute("aria-invalid")).toBe("true");
    expect((screen.getByRole("button", { name: "Simpan (2)" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input(2), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan (1)" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([{ id: "a", actual: null }]));
  });

  it("filters by COA or item text", () => {
    render(<ActualEntry lines={lines} onSave={ok()} />);
    fireEvent.change(screen.getByLabelText("Cari COA atau uraian"), { target: { value: "gaji" } });
    expect(screen.getAllByRole("textbox", { name: /Actual 2026 baris/ })).toHaveLength(1);
    expect(screen.getByDisplayValue("")).toBeTruthy();
  });
});
