import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EntityBases } from "./entity-bases";

// Revenue per entity from the workbook's invoice plan (rounded); head counts as Finance would type them.
const rows = [
  { entity: "ESTRADA", revenue: "354120789363", heads: 120 },
  { entity: "MATRIK", revenue: "96309508983", heads: null },
  { entity: "DJALU", revenue: "5283600000", heads: null },
  { entity: "PAS", revenue: "2116800000", heads: null },
];

describe("EntityBases", () => {
  it("shows each entity's revenue share, and its headcount share as Finance types", () => {
    render(<EntityBases rows={rows} editable onSave={vi.fn()} />);
    expect(screen.getByTestId("revenue-share-ESTRADA").textContent).toBe("77,35%");
    expect(screen.getByTestId("headcount-share-ESTRADA").textContent).toBe("100,00%");
    fireEvent.change(screen.getByLabelText("Headcount MATRIK"), { target: { value: "40" } });
    expect(screen.getByTestId("headcount-share-ESTRADA").textContent).toBe("75,00%");
  });

  it("saves whole numbers only", async () => {
    const onSave = vi.fn(async () => ({ ok: true, message: "Headcount disimpan." }));
    render(<EntityBases rows={rows} editable onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Headcount MATRIK"), { target: { value: "2,5" } });
    expect((screen.getByRole("button", { name: "Simpan headcount" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Headcount MATRIK"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan headcount" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ESTRADA: 120, MATRIK: 40 }));
    expect(await screen.findByText("Headcount disimpan.")).toBeTruthy();
  });
});
