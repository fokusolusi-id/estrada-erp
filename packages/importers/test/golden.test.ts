import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OrgTree, contribution, pnl, sum, type SummaryLine } from "@estrada/domain";
import { ORG_UNITS } from "@estrada/db/seed-data";
import { readRkaWorkbook, type ImportedLine } from "../src/index";

/**
 * Golden test: the app must reproduce Finance's numbers from RKA_2027_Upd_Fin v2.xlsx to the rupiah.
 * Expected figures are copied from the workbook's own Rekap RKA 2027 sheet.
 * The workbook is client data and is not committed: put it in fixtures/ or point RKA_WORKBOOK at it.
 */
const WORKBOOK = process.env.RKA_WORKBOOK ?? resolve(import.meta.dirname, "../../../fixtures/RKA_2027_Upd_Fin v2.xlsx");
const org = new OrgTree(ORG_UNITS.map((u) => ({ code: u.code, parent: u.parentCode, type: u.type })));

describe.skipIf(!existsSync(WORKBOOK))("golden: RKA_2027_Upd_Fin v2.xlsx", async () => {
  const wb = existsSync(WORKBOOK) ? await readRkaWorkbook(WORKBOOK, ORG_UNITS) : null;
  const lines = wb?.lines ?? [];
  const asSummary = (ls: ImportedLine[]): SummaryLine[] => ls.map((l) => ({ category: l.category, ownerUnit: l.ownerUnit, entity: l.entity, months: l.months }));
  const row = (key: string) => pnl(asSummary(lines)).find((r) => r.key === key)!;
  const costBy = (keyOf: (l: ImportedLine) => string) =>
    Object.fromEntries(
      contribution(lines.map((l) => ({ ...asSummary([l])[0]!, ownerUnit: keyOf(l) })), (l) => l.ownerUnit).map((c) => [c.key, c.cost.toFixed(2)]),
    );

  it("imports all 192 lines with nothing left out", () => {
    expect(wb!.problems).toEqual([]);
    expect(lines).toHaveLength(192);
  });

  it("reproduces revenue (invoice plan) and total cost to the rupiah", () => {
    expect(row("Revenue").total.toFixed(2)).toBe("457830698346.00");
    expect(row("TotalCost").total.toFixed(2)).toBe("294400936589.71");
  });

  it("reproduces each category", () => {
    expect(["COGS", "OPEX", "OTHERS", "CAPEX"].map((k) => row(k).total.toFixed(2))).toEqual([
      "242031043835.71",
      "31963806954.00",
      "8176400000.00",
      "12229685800.00",
    ]);
  });

  it("reproduces revenue per entity, and shows that all cost sits on ESTRADA", () => {
    const byEntity = contribution(asSummary(lines), (l) => l.entity);
    expect(Object.fromEntries(byEntity.map((e) => [e.key, [e.revenue.toFixed(0), e.cost.toFixed(2)]]))).toEqual({
      ESTRADA: ["354120789363", "294400936589.71"],
      MATRIK: ["96309508983", "0.00"],
      DJALU: ["5283600000", "0.00"],
      PAS: ["2116800000", "0.00"],
    });
  });

  it("reproduces Rekap's cost per requestor division and unit", () => {
    expect(costBy((l) => org.divisionOf(l.requestorUnit))).toEqual({
      FRM: "9751946260.00",
      HCM: "29205945824.00",
      PDMS: "65677959505.71",
      BCD: "173573200000.00",
      PST: "16191885000.00",
    });
    expect(costBy((l) => l.requestorUnit)).toMatchObject({ PMO: "423150000.00", SCM: "63386291593.71", ISO: "1075217910.00", MSO: "793300002.00" });
  });

  it("reproduces Rekap's monthly total cost", () => {
    const m = row("TotalCost").months;
    expect([m[0]!.toFixed(2), m[11]!.toFixed(2), sum(m).toFixed(2)]).toEqual(["49099172580.33", "36490502616.58", "294400936589.71"]);
  });

  it("explains the Rp 45 jt gap: one FRM line has a typed total and no months", () => {
    const l = lines.find((x) => x.ref.no === 21)!;
    expect([l.coaCode, l.requestorUnit, l.ownerUnit, sum(l.months).toFixed(0)]).toEqual(["6222", "FRM", "HCM", "0"]);
    expect(l.flags.join(" ")).toMatch(/Rp45 jt diketik manual/);
  });

  it("adds the 9 codes missing from COA Master as provisional, for Finance to decide", () => {
    expect(wb!.accounts.filter((a) => a.provisional).map((a) => a.code).sort()).toEqual(["1615", "1616", "4300", "5100-1", "5200-1", "6130-S2", "6133", "6400", "7225"]);
    expect(wb!.accounts.filter((a) => !a.provisional)).toHaveLength(76);
    expect(wb!.references).toHaveLength(148);
  });

  it("keeps 57 workbook flags and 46 cross-division lines", () => {
    expect(lines.filter((l) => l.flags.length)).toHaveLength(57);
    expect(lines.filter((l) => l.crossDivision)).toHaveLength(46);
  });
});
