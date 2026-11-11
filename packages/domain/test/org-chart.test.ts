import { describe, expect, it } from "vitest";
import { orgChart, seatStatus } from "../src/org-chart";

// Struktur Organisasi as a chart: units from Unit & Entitas, positions and their people from Posisi & pjs.
const units = [
  { code: "PDMS", name: "Project Delivery", type: "division" as const, parent: "DIR" },
  { code: "DIR", name: "Direksi", type: "company" as const, parent: null },
  { code: "SCM", name: "Supply Chain", type: "department" as const, parent: "PDMS" },
  { code: "BCD", name: "Business Commercial", type: "division" as const, parent: "DIR" },
  { code: "PMO", name: "PMO", type: "department" as const, parent: "PDMS" },
];
const seat = (id: string, unit: string, role: "requestor" | "default_owner" | "division_owner" | "director", holder: string | null = "u", acting: string | null = null) => ({
  id,
  orgUnit: unit,
  title: id,
  role,
  holder,
  acting,
});

describe("orgChart", () => {
  it("nests units under their parent, divisions and departments in code order", () => {
    const [root] = orgChart(units, []);
    expect(root!.code).toBe("DIR");
    expect(root!.children.map((c) => c.code)).toEqual(["BCD", "PDMS"]);
    expect(root!.children[1]!.children.map((c) => c.code)).toEqual(["PMO", "SCM"]);
  });

  it("lists each unit's positions with the head first", () => {
    const [root] = orgChart(units, [seat("req", "SCM", "requestor"), seat("head", "SCM", "default_owner"), seat("dir", "DIR", "director")]);
    expect(root!.positions.map((p) => p.id)).toEqual(["dir"]);
    const scm = root!.children[1]!.children[1]!;
    expect(scm.positions.map((p) => p.id)).toEqual(["head", "req"]);
  });

  it("counts empty seats down the tree, so a division shows what is missing below it", () => {
    const [root] = orgChart(units, [seat("a", "SCM", "default_owner", null), seat("b", "PMO", "requestor", null, "pjs"), seat("c", "BCD", "division_owner", null)]);
    expect(root!.vacant).toBe(2);
    expect(root!.children[1]!.vacant).toBe(1);
  });

  it("keeps a unit whose parent is missing as a root instead of dropping it", () => {
    expect(orgChart([{ code: "X", name: "X", type: "unit", parent: "GONE" }], []).map((n) => n.code)).toEqual(["X"]);
  });
});

describe("seatStatus", () => {
  it("is filled, held by a pjs, named on the document without an account, or empty", () => {
    expect([
      seatStatus({ holder: "u", acting: null }),
      seatStatus({ holder: null, acting: "p" }),
      seatStatus({ holder: null, acting: null, holderName: "Arya" }),
      seatStatus({ holder: null, acting: null }),
    ]).toEqual(["filled", "acting", "named", "vacant"]);
  });

  it("does not count a seat named on the document as empty", () => {
    const [root] = orgChart(units, [{ ...seat("a", "SCM", "default_owner", null), holderName: "Vita" }]);
    expect(root!.vacant).toBe(0);
  });
});
