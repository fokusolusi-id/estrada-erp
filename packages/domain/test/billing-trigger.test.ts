import { describe, expect, it } from "vitest";
import { nextTermin, waitsForRfs } from "../src/billing-trigger";

describe("waitsForRfs (sheet FC06_Implementasi, BR-IMP-002; client decision: service means Recurring)", () => {
  it("holds every invoice of a recurring project until RFS", () => {
    expect(waitsForRfs({ businessModel: "recurring", rfsOn: null })).toBe(true);
    expect(waitsForRfs({ businessModel: "recurring", rfsOn: "2027-02-01" })).toBe(false);
  });
  it("does not hold project, trading or unset deals", () => {
    for (const businessModel of ["project", "trading", null] as const) expect(waitsForRfs({ businessModel, rfsOn: null })).toBe(false);
  });
});

describe("nextTermin", () => {
  it("is the first by number without a live invoice", () => {
    expect(nextTermin([3, 1, 2], [1])).toBe(2);
    expect(nextTermin([1, 2], [1, 2])).toBeNull();
    expect(nextTermin([], [])).toBeNull();
  });
});
