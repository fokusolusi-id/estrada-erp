import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv (audit export)", () => {
  it("quotes every field and defuses formulas", () => {
    expect(toCsv([["a", 'say "hi"'], ["=SUM(A1)", "-1"]])).toBe('\ufeff"a","say ""hi"""\r\n"\'=SUM(A1)","\'-1"\r\n');
  });
});
