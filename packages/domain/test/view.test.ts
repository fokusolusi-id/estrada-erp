import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import { inView, pickView, repeatedColumns, viewChoices } from "../src/view";

// The header's Entitas and Divisi pick what every screen shows. They narrow what a position may already see, never widen it.
const org = new OrgTree([
  { code: "DIR", parent: null, type: "company" },
  { code: "PDMS", parent: "DIR", type: "division" },
  { code: "SCM", parent: "PDMS", type: "department" },
  { code: "BCD", parent: "DIR", type: "division" },
  { code: "FRM", parent: "DIR", type: "division" },
]);
const ENTITIES = ["ESTRADA", "MATRIK", "DJALU", "PAS"];
const actor = (over: Partial<Actor>): Actor => ({ userId: "u", role: "finance", orgUnit: "FRM", entities: ["*"], ...over });

describe("viewChoices: what the header offers", () => {
  it("offers a company-wide role every entity and division", () => {
    expect(viewChoices(actor({}), ENTITIES, org)).toEqual({ entities: ENTITIES, divisions: ["BCD", "FRM", "PDMS"] });
  });

  it("offers a unit-scoped position its own entities and the division it sits in", () => {
    expect(viewChoices(actor({ role: "requestor", orgUnit: "SCM", entities: ["ESTRADA", "PAS"] }), ENTITIES, org)).toEqual({
      entities: ["ESTRADA", "PAS"],
      divisions: ["PDMS"],
    });
  });

  it("offers a position at company level every division below it", () => {
    expect(viewChoices(actor({ role: "division_owner", orgUnit: "DIR" }), ENTITIES, org).divisions).toEqual(["BCD", "FRM", "PDMS"]);
  });
});

describe("pickView: the saved choice, checked against what is offered", () => {
  const choices = { entities: ENTITIES, divisions: ["BCD", "PDMS"] };

  it("keeps a choice that is on offer", () => {
    expect(pickView({ entity: "MATRIK", division: "BCD" }, choices)).toEqual({ entity: "MATRIK", division: "BCD" });
  });

  it("falls back to Semua for a choice that is not, or was never made", () => {
    expect(pickView({ entity: "XYZ", division: "FRM" }, choices)).toEqual({ entity: null, division: null });
    expect(pickView({}, choices)).toEqual({ entity: null, division: null });
  });

  it("filters nothing when there is only one to choose from: a position's own scope is already the view", () => {
    expect(pickView({ entity: "PAS", division: "PDMS" }, { entities: ["PAS"], divisions: ["PDMS"] })).toEqual({ entity: null, division: null });
  });
});

describe("inView: which lines a screen shows", () => {
  const line = (entity: string, ownerUnit: string) => ({ entity, ownerUnit });

  it("keeps lines of the chosen entity whose owner sits in the chosen division", () => {
    const keep = inView({ entity: "ESTRADA", division: "PDMS" }, org);
    expect([line("ESTRADA", "SCM"), line("MATRIK", "SCM"), line("ESTRADA", "BCD")].map(keep)).toEqual([true, false, false]);
  });

  it("keeps everything under Semua", () => {
    expect(inView({ entity: null, division: null }, org)(line("PAS", "FRM"))).toBe(true);
  });
});

describe("repeatedColumns: columns a narrowed table no longer needs", () => {
  const lines = [{ entity: "MATRIK", ownerUnit: "SCM" }, { entity: "MATRIK", ownerUnit: "SCM" }];

  it("drops Entitas once one entity is picked, and Pemilik once a division leaves a single owner", () => {
    expect(repeatedColumns({ entity: "MATRIK", division: "PDMS" }, lines)).toEqual({ entity: true, owner: true });
  });

  it("keeps a column whose rows still differ, and everything under Semua", () => {
    expect(repeatedColumns({ entity: null, division: "PDMS" }, [...lines, { entity: "PAS", ownerUnit: "PMO" }])).toEqual({ entity: false, owner: false });
    expect(repeatedColumns({ entity: null, division: null }, lines)).toEqual({ entity: false, owner: false });
  });
});
