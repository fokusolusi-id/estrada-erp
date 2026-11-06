import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SharedCostEditor, type SharedCostLine } from "./shared-cost-editor";

const ENTITIES = ["ESTRADA", "MATRIK", "DJALU", "PAS"];
// Demo cost lines carried by ESTRADA; the first is already shared by revenue.
const lines: SharedCostLine[] = [
  { id: "a", coaCode: "6310", coaName: "Beban sewa kantor", entity: "ESTRADA", ownerUnit: "FRM", total: "1200000000", basis: "revenue" },
  { id: "b", coaCode: "6320", coaName: "Beban jasa profesional", entity: "ESTRADA", ownerUnit: "FRM", total: "167209772" },
  { id: "c", coaCode: "6241", coaName: "Beban internet", item: "Internet kantor", entity: "ESTRADA", ownerUnit: "SCM", total: "237855840" },
];
const ok = () => vi.fn(async () => ({ ok: true, message: "2 baris disimpan." }));
const basis = (n: number) => screen.getByLabelText(`Dasar alokasi baris ${n}`) as HTMLSelectElement;

describe("SharedCostEditor", () => {
  it("shows each cost line with its basis, and filters to shared lines only", () => {
    render(<SharedCostEditor lines={lines} entities={ENTITIES} onSave={ok()} />);
    expect(basis(1).value).toBe("revenue");
    expect(basis(2).value).toBe("");
    fireEvent.click(screen.getByLabelText("Hanya biaya bersama"));
    expect(screen.queryByLabelText("Dasar alokasi baris 2")).toBeNull();
  });

  it("asks for a percentage per entity on the fixed basis, and blocks saving until they add up to 100", async () => {
    const onSave = ok();
    render(<SharedCostEditor lines={lines} entities={ENTITIES} onSave={onSave} />);
    fireEvent.change(basis(2), { target: { value: "fixed" } });
    fireEvent.change(screen.getByLabelText("ESTRADA % baris 2"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("MATRIK % baris 2"), { target: { value: "40" } });
    expect(screen.getByText("Persentase harus berjumlah 100")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Simpan (1)" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("DJALU % baris 2"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("PAS % baris 2"), { target: { value: "10" } });
    fireEvent.change(basis(1), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan (2)" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith([
        { id: "a", basis: null, fixed: null },
        { id: "b", basis: "fixed", fixed: { ESTRADA: "40", MATRIK: "40", DJALU: "10", PAS: "10" } },
      ]),
    );
    expect(await screen.findByText("2 baris disimpan.")).toBeTruthy();
  });

  it("shows a locked line's basis without letting it change", () => {
    render(<SharedCostEditor lines={[{ ...lines[0]!, editable: false }]} entities={ENTITIES} onSave={ok()} />);
    expect(basis(1).disabled).toBe(true);
  });
});
