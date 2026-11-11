import { describe, expect, it } from "vitest";
import { planStructure, type StructureFile } from "../src/structure";

// Struktur Organisasi Oktober, as a file: units with their head, read into the app without inventing anyone.
const file: StructureFile = {
  units: [
    { code: "BCD", name: "Business Commercial Division", type: "division", parent: "DIR", head: "Arya" },
    { code: "TBD", name: "Telco Business Dept.", type: "department", parent: "BCD", head: "Setiadi" },
    { code: "TBD-AM", name: "Account Mgmt", type: "unit", parent: "TBD" },
    { code: "MSO", name: "Managed Service Operations Dept.", type: "department", parent: "PDMS", head: null },
    { code: "FIN-BFP", name: "Business Finance & Precalc", type: "unit", parent: "FIN", head: "Rini" },
    { code: "FIN", name: "Finance", type: "department", parent: "FRM", head: "Maria" },
  ],
};
const existing = {
  units: ["DIR", "BCD", "PDMS", "FRM", "MSO"],
  seats: [{ id: "s1", orgUnit: "BCD", role: "division_owner" as const, holder: null, holderName: null }],
};

describe("planStructure", () => {
  it("adds or renames every unit, parents before children", () => {
    const { units } = planStructure(file, existing);
    expect(units.map((u) => u.code)).toEqual(["BCD", "TBD", "TBD-AM", "MSO", "FIN", "FIN-BFP"]);
  });

  it("gives each head a seat by unit type: division owner, default owner, or a section seat", () => {
    const { create } = planStructure(file, existing);
    expect(create.map((s) => [s.orgUnit, s.role, s.title, s.holderName])).toEqual([
      ["TBD", "default_owner", "Kepala Telco Business Dept.", "Setiadi"],
      ["MSO", "default_owner", "Kepala Managed Service Operations Dept.", null],
      ["FIN", "default_owner", "Kepala Finance", "Maria"],
      ["FIN-BFP", "requestor", "Business Finance & Precalc", "Rini"],
    ]);
  });

  it("names an existing empty head seat instead of adding a second one, and leaves a seat with an account alone", () => {
    expect(planStructure(file, existing).name).toEqual([{ id: "s1", holderName: "Arya" }]);
    const held = { ...existing, seats: [{ ...existing.seats[0]!, holder: "user-1" }] };
    expect(planStructure(file, held).name).toEqual([]);
  });

  it("reports a unit whose parent is nowhere, and a type it does not know", () => {
    const bad: StructureFile = { units: [{ code: "X", name: "X", type: "department", parent: "NOPE" }, { code: "Y", name: "Y", type: "team" as never, parent: "DIR" }] };
    expect(planStructure(bad, existing).problems.sort()).toEqual(["X: induk NOPE tidak ditemukan", "Y: jenis team tidak dikenal"]);
  });
});
