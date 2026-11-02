import { describe, expect, it } from "vitest";
import { headcountBasis, headcountMonths, headcountProblems, money, sum } from "../src/index";

// HCM sheet row 33: CBD asks for 6 Account Managers, Rp 100.500.000 a month from January, Rp 1.206.000.000 in 2027.
const am = { position: "Account Manager", count: 6, startMonth: 1, costPerHead: money("16750000") };

describe("headcountMonths", () => {
  it("costs every head from the start month, as the workbook's recruitment rows do", () => {
    const months = headcountMonths(am);
    expect(months.map((m) => m.toFixed(0))).toEqual(Array.from({ length: 12 }, () => "100500000"));
    expect(sum(months).toFixed(2)).toBe("1206000000.00");
  });

  it("leaves the months before a mid-year hire at zero", () => {
    const months = headcountMonths({ ...am, count: 2, startMonth: 7, costPerHead: money("7650000.50") });
    expect(months.slice(0, 6).every((m) => m.isZero())).toBe(true);
    expect(months[6]!.toFixed(2)).toBe("15300001.00");
    expect(sum(months).toFixed(2)).toBe("91800006.00");
  });
});

describe("headcountProblems", () => {
  it("accepts a complete position", () => {
    expect(headcountProblems(am)).toEqual({});
  });

  it("names each field that is missing or out of range", () => {
    expect(headcountProblems({ position: " ", count: 0, startMonth: 13, costPerHead: money("0") })).toEqual({
      position: "required",
      count: "out_of_range",
      startMonth: "out_of_range",
      costPerHead: "not_positive",
    });
    expect(headcountProblems({ ...am, count: 1.5 })).toEqual({ count: "out_of_range" });
    expect(headcountProblems({ ...am, count: 1000 })).toEqual({ count: "out_of_range" });
  });
});

describe("headcountBasis", () => {
  it("states the head count, the cost per head and the start month, so reviewers see how the line was built", () => {
    expect(headcountBasis(am)).toBe("Rencana headcount: 6 orang × Rp 16.750.000 per bulan, mulai Jan");
    expect(headcountBasis({ ...am, count: 1, startMonth: 9 })).toBe("Rencana headcount: 1 orang × Rp 16.750.000 per bulan, mulai Sep");
  });
});
