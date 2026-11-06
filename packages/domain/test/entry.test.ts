import { describe, expect, it } from "vitest";
import { fillRight, parseIdr, parsePaste, pasteMonths, spreadEvenly } from "../src/entry";
import { money, sum, ZERO } from "../src/money";

const str = (ms: readonly { toString(): string }[]) => ms.map((m) => m.toString());

describe("parseIdr: amounts typed or pasted in id-ID format", () => {
  it("reads id-ID grouping and decimal comma", () => {
    expect(parseIdr("1.234.567,89").toString()).toBe("1234567.89");
    expect(parseIdr("19.821.320").toString()).toBe("19821320");
    expect(parseIdr("1,5").toString()).toBe("1.5");
  });

  it("reads plain numbers and en-US exports from Excel", () => {
    // Project Delivery & Managed Serv row 20: 390,686,823.67 per month
    expect(parseIdr("390686823.67").toString()).toBe("390686823.67");
    expect(parseIdr("390,686,823.67").toString()).toBe("390686823.67");
    expect(parseIdr("1,234,567").toString()).toBe("1234567");
  });

  it("treats a single dot before three digits as id-ID grouping", () => {
    expect(parseIdr("1.648").toString()).toBe("1648");
    expect(parseIdr("1.5").toString()).toBe("1.5");
  });

  it("strips Rp, spaces and accounting brackets", () => {
    expect(parseIdr("Rp 1.648.000").toString()).toBe("1648000");
    expect(parseIdr(" 1 648 000 ").toString()).toBe("1648000");
    expect(parseIdr("(1.000)").toString()).toBe("-1000");
  });

  it("reads blank and Excel dash as zero", () => {
    expect(parseIdr("").eq(ZERO)).toBe(true);
    expect(parseIdr(" - ").eq(ZERO)).toBe(true);
  });

  it("rejects text that is not an amount", () => {
    expect(() => parseIdr("lima juta")).toThrow(/Invalid/);
    expect(() => parseIdr("1.2.3,4,5")).toThrow(/Invalid/);
  });
});

describe("parsePaste: a block copied from Excel", () => {
  it("splits rows on newlines and cells on tabs, dropping the trailing newline", () => {
    expect(parsePaste("1\t2\t3\r\n4\t5\t6\r\n")).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });
});

describe("pasteMonths and fillRight", () => {
  const months = Array.from({ length: 12 }, () => ZERO);

  it("pastes from the chosen month and drops cells past December", () => {
    const out = pasteMonths(months, 10, ["1.000", "2.000", "3.000", "4.000"]);
    expect(str(out.slice(8))).toEqual(["0", "1000", "2000", "3000"]);
    expect(out).toHaveLength(12);
  });

  it("fills one month's amount across the rest of the year", () => {
    const start = pasteMonths(months, 3, ["19821320"]);
    const out = fillRight(start, 3);
    expect(str(out.slice(0, 2))).toEqual(["0", "0"]);
    expect(out.slice(2).every((m) => m.eq(money("19821320")))).toBe(true);
  });
});

describe("spreadEvenly: a typed yearly total split over Jan–Des (client decision on the FRM Rp 45 jt line)", () => {
  it("splits Rp 45.000.000 into Rp 3.750.000 a month", () => {
    expect(str(spreadEvenly(money("45000000")))).toEqual(Array.from({ length: 12 }, () => "3750000"));
  });

  it("puts the leftover cents in December so the months add up to the total exactly", () => {
    const out = spreadEvenly(money("100000"));
    expect(str(out.slice(0, 11))).toEqual(Array.from({ length: 11 }, () => "8333.33"));
    expect(out[11]!.toString()).toBe("8333.37");
    expect(sum(out).toString()).toBe("100000");
  });
});
