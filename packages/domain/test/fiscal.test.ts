import { describe, expect, it } from "vitest";
import { carryCashForward, carryLinesForward, newYearProblem, pickYear, priorYear, rkaLabel } from "../src/fiscal";
import { money, sum, ZERO } from "../src/money";

const v = (fiscalYear: number, status: "open" | "locked" | "archived", copiedFromId: string | null = null) => ({ fiscalYear, status, copiedFromId });

describe("pickYear: the year every screen shows", () => {
  const versions = [v(2026, "locked"), v(2027, "open"), v(2025, "archived")];

  it("is the viewer's choice when that year has a version to show", () => {
    expect(pickYear("2026", versions)).toBe(2026);
  });

  it("falls back to the newest year with an open version, then the newest year", () => {
    expect(pickYear(undefined, versions)).toBe(2027);
    expect(pickYear("2031", versions)).toBe(2027);
    expect(pickYear("x", [v(2026, "locked"), v(2027, "locked")])).toBe(2027);
  });

  it("ignores archived versions, and has no year before the first cycle", () => {
    expect(pickYear("2025", versions)).toBe(2027);
    expect(pickYear(undefined, [])).toBeNull();
  });

  it("names the comparison year", () => {
    expect(priorYear(2028)).toBe(2027);
  });

  it("calls every version of a year by the year alone, whatever its stored name", () => {
    expect(rkaLabel({ fiscalYear: 2027 })).toBe("RKA 2027");
  });
});

describe("newYearProblem: two years open only while one of them is a revision", () => {
  it("refuses a second version of the same year", () => {
    expect(newYearProblem(2027, [v(2027, "open")])).toBe("already_open");
  });

  it("refuses a new year while another year's first version is still open", () => {
    expect(newYearProblem(2028, [v(2027, "open")])).toBe("other_year_open");
  });

  it("allows it once that year is locked, or when the open one is a revision", () => {
    expect(newYearProblem(2028, [v(2027, "locked")])).toBeNull();
    expect(newYearProblem(2028, [v(2027, "locked"), v(2027, "open", "base-id")])).toBeNull();
  });
});

describe("carryLinesForward: next year starts from last year's locked RKA", () => {
  const months = (n: number) => Array.from({ length: 12 }, () => money(n));
  const last = [
    { coaCode: "6241", entityCode: "ESTRADA", requestorUnit: "SCM", ownerUnit: "SCM", item: "Internet kantor", basis: "Kontrak", notes: null, crossDivision: false, months: months(1_000_000), sharedBasis: "revenue" as const, sharedFixed: null },
  ];

  it("copies each line as a Draft starting point, months included, with last year's total as the comparison", () => {
    const [line] = carryLinesForward(last);
    expect(line).toMatchObject({ coaCode: "6241", ownerUnit: "SCM", item: "Internet kantor", basis: "Kontrak", state: "draft", sharedBasis: "revenue" });
    expect(sum(line!.months).toFixed(0)).toBe("12000000");
    expect(line!.priorRka.toFixed(0)).toBe("12000000");
    // Last year's actual is entered once on the new year's Realisasi screen.
    expect(line!.priorActual).toBeNull();
  });
});

describe("carryCashForward: next year's opening cash and loans from this year's December", () => {
  const twelve = (last: number) => Array.from({ length: 12 }, (_, i) => (i === 11 ? money(last) : ZERO));

  it("opens each entity at December's closing cash, receivables and payables, keeping its buffer", () => {
    const { openings } = carryCashForward(
      new Map([["ESTRADA", { rows: { closing: twelve(500), receivablesEnd: twelve(80), payablesEnd: twelve(30) }, minimumCash: money(7) }]]),
      [],
    );
    const e = openings.get("ESTRADA")!;
    expect([e.cash, e.receivables, e.payables, e.priorYearTax, e.minimumCash].map((m) => m.toFixed(0))).toEqual(["500", "80", "30", "0", "7"]);
  });

  it("carries each facility at its December outstanding and drops loans that are paid off", () => {
    const { facilities } = carryCashForward(new Map(), [
      { name: "KMK Mandiri", type: "new", entity: "MATRIK", rate: "0.095", creditLimit: money(20), notes: null, outstanding: twelve(12) },
      { name: "Lunas", type: "existing", entity: "ESTRADA", rate: "0.1", creditLimit: null, notes: null, outstanding: twelve(0) },
    ]);
    expect(facilities.map((f) => [f.name, f.type, f.openingBalance.toFixed(0)])).toEqual([["KMK Mandiri", "existing", "12"]]);
  });
});
