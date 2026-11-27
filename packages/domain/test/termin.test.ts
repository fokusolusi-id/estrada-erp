import { describe, expect, it } from "vitest";
import { money } from "../src/money";
import { defaultTermins, terminSchedule } from "../src/termin";

describe("defaultTermins (sheets 42_Jadwal_Termin and 22_Assumptions; offsets confirmed by the client)", () => {
  it("splits the value 15/80/5 and dates DP +30 days, progress +3 months, retention +6 months after it", () => {
    expect(defaultTermins(money("577320000"), "2026-01-02").map((t) => [t.description, t.amount, t.plannedDate])).toEqual([
      ["DP 15%", "86598000.00", "2026-02-01"],
      ["Termin (progress) 80%", "461856000.00", "2026-04-02"],
      ["Retensi 5%", "28866000.00", "2026-10-02"],
    ]);
  });
  it("adds up to the value to the sen, and keeps a month's end inside the month", () => {
    const t = defaultTermins(money("100.01"), "2026-11-30");
    expect(t.map((x) => x.amount)).toEqual(["15.00", "80.01", "5.00"]);
    expect([t[1]!.plannedDate, t[2]!.plannedDate]).toEqual(["2027-02-28", "2027-08-28"]);
  });
});

describe("terminSchedule (planned against billed, overdue)", () => {
  const termins = [
    { dealId: "a", no: 1, plannedOn: "2027-01-10", amount: money("100") },
    { dealId: "a", no: 2, plannedOn: "2027-02-10", amount: money("800") },
    { dealId: "a", no: 3, plannedOn: "2027-09-10", amount: money("50") },
    { dealId: "b", no: 1, plannedOn: "2026-12-01", amount: money("70") },
  ];
  const invoices = [
    { dealId: "a", no: 1, state: "issued" as const, dpp: money("95"), invoicedOn: "2027-02-01" },
    { dealId: "a", no: 2, state: "draft" as const, dpp: money("800"), invoicedOn: "2027-02-11" },
    { dealId: "a", no: 3, state: "cancelled" as const, dpp: money("50"), invoicedOn: "2027-02-11" },
  ];
  const s = terminSchedule(termins, invoices, 2027, "2027-03-01");
  it("marks each termin billed, being billed, overdue or planned", () => {
    expect(s.rows.map((r) => [r.dealId, r.no, r.status, r.billed.toString()])).toEqual([
      ["b", 1, "overdue", "0"],
      ["a", 1, "billed", "95"],
      ["a", 2, "overdue", "0"],
      ["a", 3, "planned", "0"],
    ]);
  });
  it("totals the plan by planned month and the billing by invoice month, within the year", () => {
    expect(s.planned.map(String).slice(0, 3)).toEqual(["100", "800", "0"]);
    expect(s.billed.map(String).slice(0, 3)).toEqual(["0", "95", "0"]);
  });
  it("counts a draft past its date as overdue, and not one due today or later", () => {
    expect(s.overdue).toBe(2);
    expect(terminSchedule([termins[1]!], [], 2027, "2027-02-10").rows[0]!.status).toBe("planned");
    expect(terminSchedule([termins[1]!], [invoices[1]!], 2027, "2027-02-10").rows[0]!.status).toBe("drafted");
  });
});
