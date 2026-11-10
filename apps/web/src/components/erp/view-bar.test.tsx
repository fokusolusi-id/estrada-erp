import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ViewBar, type ViewBarProps } from "./view-bar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const props = (over: Partial<ViewBarProps> = {}): ViewBarProps => ({
  years: [2028, 2027],
  year: 2028,
  openYears: [2028],
  choices: { entities: ["ESTRADA", "MATRIK"], divisions: ["BCD", "PDMS"] },
  view: { entity: null, division: null },
  unit: "juta",
  onYear: vi.fn(async () => {}),
  onView: vi.fn(async () => {}),
  onUnit: vi.fn(async () => {}),
  ...over,
});

const options = (label: string) => [...(screen.getByLabelText(label) as HTMLSelectElement).options].map((o) => o.textContent);

describe("ViewBar: Tahun, Entitas, Divisi and Satuan for every screen", () => {
  it("offers each setting, with Semua first and locked years marked", () => {
    render(<ViewBar {...props()} />);
    expect(options("Tahun anggaran")).toEqual(["RKA 2028", "RKA 2027 (terkunci)"]);
    expect(options("Entitas")).toEqual(["Semua entitas", "ESTRADA", "MATRIK"]);
    expect(options("Divisi")).toEqual(["Semua divisi", "BCD", "PDMS"]);
    expect(options("Satuan")).toEqual(["Angka penuh", "Juta", "Miliar"]);
  });

  it("saves the viewer's pick", async () => {
    const p = props();
    render(<ViewBar {...p} />);
    fireEvent.change(screen.getByLabelText("Divisi"), { target: { value: "PDMS" } });
    await waitFor(() => expect(p.onView).toHaveBeenCalledWith("division", "PDMS"));
    fireEvent.change(screen.getByLabelText("Satuan"), { target: { value: "miliar" } });
    await waitFor(() => expect(p.onUnit).toHaveBeenCalledWith("miliar"));
  });

  it("shows a position's only entity or division as text, with nothing to pick", () => {
    render(<ViewBar {...props({ choices: { entities: ["PAS"], divisions: ["PDMS"] } })} />);
    expect(screen.queryByLabelText("Entitas")).toBeNull();
    expect(screen.getByText("PAS")).toBeTruthy();
    expect(screen.getByText("PDMS")).toBeTruthy();
  });

  it("sums up the view on one header button: the year, anything narrowed and the unit", () => {
    render(<ViewBar {...props({ view: { entity: "MATRIK", division: "BCD" } })} />);
    expect(screen.getByRole("button", { name: /^Tampilan/ }).textContent).toContain("RKA 2028· MATRIK · BCD · Juta");
  });
});
