import { describe, expect, it } from "vitest";
import { formatIdr, money, scaleTo, sum } from "../src/money";

describe("money", () => {
  it("adds without float noise (workbook showed -5.85e-09 variances)", () => {
    // 1708827950 - 1708827960 in COA Master produced float drift once divided
    const monthly = money("390686823.67");
    const total = sum(Array.from({ length: 12 }, () => monthly));
    expect(total.toFixed(2)).toBe("4688241884.04");
  });

  it("sums the RKA 2027 invoice revenue per entity to the rupiah", () => {
    const total = sum([
      money("354120789363"), // ESTRADA
      money("96309508983"), // MATRIK
      money("5283600000"), // DJALU
      money("2116800000"), // PAS
    ]);
    expect(total.toFixed(0)).toBe("457830698346");
  });

  it("formats in id-ID style", () => {
    expect(formatIdr(money("1234567.89"))).toBe("Rp 1.234.567,89");
    expect(formatIdr(money("5000000"), { decimals: 0 })).toBe("Rp 5.000.000");
  });

  it("scales to juta and miliar like the workbook's satuan pembagi", () => {
    expect(scaleTo(money("457830698346"), "juta").toFixed(2)).toBe("457830.70");
    expect(scaleTo(money("457830698346"), "miliar").toFixed(1)).toBe("457.8");
  });

  it("rejects non-numeric input", () => {
    expect(() => money("12a")).toThrow();
  });
});
