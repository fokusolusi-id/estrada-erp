import { describe, expect, it } from "vitest";
import { headcountBasis, headcountFromMonths, headcountMonths, headcountProblems, money, sum, ZERO } from "../src/index";

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

describe("headcountFromMonths", () => {
  const flat = (v: string, from = 1) => Array.from({ length: 12 }, (_, i) => (i + 1 >= from ? money(v) : ZERO));

  it("reads a workbook recruitment row back into a position: RKA 2027 Data #43, 6 AMs at Rp 100.500.000 a month", () => {
    expect(headcountFromMonths("Account Manager (AM)", 6, flat("100500000"))).toEqual({ position: "Account Manager (AM)", count: 6, startMonth: 1, costPerHead: money("16750000") });
  });

  it("finds a mid-year start month", () => {
    expect(headcountFromMonths("Marketing", 2, flat("15300000", 7))).toMatchObject({ count: 2, startMonth: 7, costPerHead: money("7650000") });
  });

  it("leaves a row alone when the plan could not rebuild its months to the rupiah", () => {
    // RKA 2027 Data #31: HCM's own recruitment budget, a different amount each month and no head count.
    const uneven = flat("9000000").map((m, i) => (i === 3 ? money("47000000") : m));
    expect(headcountFromMonths("Rekrutmen", 1, uneven)).toBeNull();
    expect(headcountFromMonths("Delivery Control", 3, flat("10000000"))).toBeNull(); // 3 heads do not split Rp 10.000.000 to the cent
    expect(headcountFromMonths("", 1, flat("4100000"))).toBeNull();
    expect(headcountFromMonths("OB", 0, flat("4100000"))).toBeNull();
    expect(headcountFromMonths("OB", 1, flat("0"))).toBeNull();
    expect(headcountFromMonths("OB", 1, flat("4100000").map((m, i) => (i === 11 ? ZERO : m)))).toBeNull(); // stops before December
  });
});
