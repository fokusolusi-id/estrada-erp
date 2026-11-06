import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CoaTree, type CoaTreeAccount } from "./coa-tree";

// COA Master codes with the parents the importer infers (6211 under 6210, 6131 under 6100).
const a = (code: string, name: string, category: CoaTreeAccount["category"], parentCode: string | null, lines = 0): CoaTreeAccount => ({
  code,
  name,
  category,
  parentCode,
  defaultOwnerUnit: null,
  active: true,
  provisional: false,
  lines,
});
const accounts = [
  a("4100", "Pendapatan Sewa CPE", "Revenue", null, 3),
  a("6100", "Beban Pemasaran", "OPEX", null),
  a("6131", "Beban konsumsi Meeting", "OPEX", "6100", 2),
  a("6210", "Beban Karyawan", "OPEX", null),
  a("6211", "Beban Gaji dan THR", "OPEX", "6210", 5),
  a("6212", "Beban bonus", "OPEX", "6210"),
];
const shown = () => screen.queryAllByRole("row").map((r) => r.getAttribute("data-code")).filter(Boolean);

describe("CoaTree", () => {
  it("groups codes by category, children under their parent, with the tree level", () => {
    render(<CoaTree accounts={accounts} />);
    expect(shown()).toEqual(["4100", "6100", "6131", "6210", "6211", "6212"]);
    expect(screen.getByRole("row", { name: /6211/ }).getAttribute("aria-level")).toBe("2");
    expect(screen.getByTestId("group-OPEX").textContent).toContain("5 kode");
  });

  it("collapses a parent to hide its children, and a category to hide the whole group", () => {
    render(<CoaTree accounts={accounts} />);
    fireEvent.click(screen.getByRole("button", { name: "Tutup 6210" }));
    expect(shown()).toEqual(["4100", "6100", "6131", "6210"]);
    fireEvent.click(screen.getByRole("button", { name: "Buka 6210" }));
    expect(shown()).toContain("6211");
    fireEvent.click(screen.getByRole("button", { name: "Tutup OPEX" }));
    expect(shown()).toEqual(["4100"]);
  });

  it("collapses and expands everything at once", () => {
    render(<CoaTree accounts={accounts} />);
    fireEvent.click(screen.getByRole("button", { name: "Tutup semua" }));
    expect(shown()).toEqual(["4100", "6100", "6210"]);
    fireEvent.click(screen.getByRole("button", { name: "Buka semua" }));
    expect(shown()).toHaveLength(6);
  });

  it("searches by code or name and keeps each match's parents in view", () => {
    render(<CoaTree accounts={accounts} />);
    fireEvent.click(screen.getByRole("button", { name: "Tutup semua" }));
    fireEvent.change(screen.getByLabelText("Cari COA"), { target: { value: "gaji" } });
    expect(shown()).toEqual(["6210", "6211"]);
  });
});
