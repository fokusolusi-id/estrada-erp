import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OrgTree, cashForecast, consolidateCash, contribution, loanSchedule, pipelineTotals, pnl, sum, ZERO, type Money, type SummaryLine } from "@estrada/domain";
import { ORG_UNITS } from "@estrada/db/seed-data";
import ExcelJS from "exceljs";
import { parseRkaData, readRkaWorkbook, sheetRows, writeRkaWorkbook, type ImportedLine } from "../src/index";

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

  it("reads the twelve recruitment rows with a head count as headcount plan positions, and leaves HCM's own rows alone", () => {
    const planned = lines.filter((l) => l.headcount);
    expect(planned.map((l) => [l.ref.no, l.headcount!.count, l.headcount!.costPerHead.toFixed(0)])).toEqual([
      [37, 2, "6500000"], [38, 1, "9500000"], [39, 1, "4100000"], [40, 1, "4100000"], [41, 1, "4100000"], [42, 1, "7650000"],
      [43, 6, "16750000"], [44, 2, "17500000"], [45, 1, "7650000"], [46, 1, "7650000"], [47, 2, "7650000"], [48, 1, "4650000"],
    ]);
    expect(lines.filter((l) => l.coaCode === "6221" && !l.headcount).map((l) => l.ref.no)).toEqual([31, 111]);
  });

  it("reproduces revenue (invoice plan) and total cost to the rupiah", () => {
    expect(row("Revenue").total.toFixed(2)).toBe("457830698346.00");
    expect(row("TotalCost").total.toFixed(2)).toBe("294445936589.71");
  });

  it("reproduces each category", () => {
    expect(["COGS", "OPEX", "OTHERS", "CAPEX"].map((k) => row(k).total.toFixed(2))).toEqual([
      "242031043835.71",
      "32008806954.00",
      "8176400000.00",
      "12229685800.00",
    ]);
  });

  it("reproduces revenue per entity, and shows that all cost sits on ESTRADA", () => {
    const byEntity = contribution(asSummary(lines), (l) => l.entity);
    expect(Object.fromEntries(byEntity.map((e) => [e.key, [e.revenue.toFixed(0), e.cost.toFixed(2)]]))).toEqual({
      ESTRADA: ["354120789363", "294445936589.71"],
      MATRIK: ["96309508983", "0.00"],
      DJALU: ["5283600000", "0.00"],
      PAS: ["2116800000", "0.00"],
    });
  });

  it("reproduces Rekap's cost per requestor division and unit", () => {
    expect(costBy((l) => org.divisionOf(l.requestorUnit))).toEqual({
      FRM: "9796946260.00",
      HCM: "29205945824.00",
      PDMS: "65677959505.71",
      BCD: "173573200000.00",
      PST: "16191885000.00",
    });
    expect(costBy((l) => l.requestorUnit)).toMatchObject({ PMO: "423150000.00", SCM: "63386291593.71", ISO: "1075217910.00", MSO: "793300002.00" });
  });

  it("reproduces Rekap's monthly total cost", () => {
    const m = row("TotalCost").months;
    expect([m[0]!.toFixed(2), m[11]!.toFixed(2), sum(m).toFixed(2)]).toEqual(["49102922580.33", "36494252616.58", "294445936589.71"]);
  });

  it("spreads the FRM line that has only a typed Rp 45 jt total evenly over the year, and says so", () => {
    const l = lines.find((x) => x.ref.no === 21)!;
    expect([l.coaCode, l.requestorUnit, l.ownerUnit, sum(l.months).toFixed(0)]).toEqual(["6222", "FRM", "HCM", "45000000"]);
    expect(new Set(l.months.map((m) => m.toFixed(0)))).toEqual(new Set(["3750000"]));
    expect(l.flags.join(" ")).toMatch(/dibagi rata/);
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

  it("reads the Pipeline sheet: 80 deals worth Rp 649,3 bn, weighted from value × probability", () => {
    const p = wb!.pipeline!;
    expect(p.problems).toEqual([]);
    expect(p.deals).toHaveLength(80);
    const totals = pipelineTotals(p.deals);
    // The sheet's own weighted column adds to Rp 775,6 bn: rows 59–60 hold a stray SUM(O3:O58) and a ratio.
    expect([totals.value.toFixed(2), totals.weighted.toFixed(2)]).toEqual(["649331348563.00", "420981860306.70"]);
    const count = (key: (d: (typeof p.deals)[number]) => string) => p.deals.reduce<Record<string, number>>((m, d) => ({ ...m, [key(d)]: (m[key(d)] ?? 0) + 1 }), {});
    expect(count((d) => d.entity)).toEqual({ ESTRADA: 65, MATRIK: 13, DJALU: 1, PAS: 1 });
    expect(count((d) => d.status)).toEqual({ WB: 34, PT: 17, PP: 29 });
    expect(count((d) => d.coaCode ?? "none")).toEqual({ "4100": 36, "4150": 15, "4200": 12, "4900": 15, none: 2 });
    expect(p.targets.map((t) => [t.segment, t.target.toFixed(0)])).toEqual([
      ["Telco Business", "250000000000"],
      ["Government Business", "150000000000"],
      ["Enterprise Business", "30000000000"],
      ["Territory Business", "20000000000"],
    ]);
  });

  it("reads the cash assumptions, openings and Obligo the forecast needs", () => {
    const c = wb!.cash!;
    expect([c.settings.collectionLag, c.settings.cogsPaymentLag, c.settings.taxRate, c.settings.minimumCash.toFixed(0)]).toEqual([2, 1, "0.22", "7000000000"]);
    expect([...c.settings.interestCoa].sort()).toEqual(["7220", "7221", "7222", "7225", "7226"]);
    expect([...c.settings.nonCashCoa].sort()).toEqual(["6290", "6291", "6292", "6293"]);
    expect([...c.openings.keys()]).toEqual(["ESTRADA", "MATRIK", "DJALU", "PAS"]);
    const e = c.openings.get("ESTRADA")!;
    expect([e.cash, e.receivables, e.payables, e.priorYearTax, e.minimumCash].map((x) => x.toFixed(2))).toEqual(["4054912335.90", "20823092606.29", "8891995641.74", "8332260170.18", "7000000000.00"]);
    // Only the existing loan carries figures; "Fasilitas Baru 1–9" are empty placeholders.
    expect(c.facilities.map((f) => [f.name, f.entity, f.rate, f.openingBalance.toFixed(2)])).toEqual([["Pinjaman Bank Existing (Mandiri/BRI/BCA/CIMB)", "ESTRADA", "0.1", "40782658280.84"]]);
  });

  it("reproduces Forecast CF Bulanan 2027 per entity and consolidated, within a rupiah", () => {
    const c = wb!.cash!;
    // The workbook's lines as it had them: FRM's Rp 45 jt line without months.
    const asWorkbook = lines.map((l) => (l.ref.no === 21 ? { ...l, months: l.months.map(() => ZERO) } : l));
    const zeros = Array.from({ length: 12 }, () => ZERO);
    const forecasts = [...c.openings].map(([entity, opening]) => {
      const loans = c.facilities.filter((f) => f.entity === entity).map((f) => ({ f, s: loanSchedule(f, f.drawdown, f.repayment) }));
      const total = (pick: (x: (typeof loans)[number]) => readonly Money[]) => loans.reduce((acc, x) => acc.map((v, i) => v.plus(pick(x)[i]!)), zeros);
      const flows = { drawdown: total((x) => x.f.drawdown), repayment: total((x) => x.f.repayment), interest: total((x) => x.s.interest) };
      return [entity, cashForecast(asWorkbook.filter((l) => l.entity === entity), opening, c.settings, flows)] as const;
    });
    const near = (got: readonly Money[], want: readonly string[]) => got.forEach((g, i) => expect(g.minus(want[i]!).abs().lt(1), `month ${i + 1}: ${g.toFixed(2)} vs ${want[i]}`).toBe(true));
    const by = Object.fromEntries(forecasts);
    near(by.ESTRADA!.rows.closing.slice(11), ["-141563730779.89"]);
    near(by.MATRIK!.rows.closing.slice(11), ["75121417006.74"]);
    expect(by.MATRIK!.pnl.tax.months[0]!.minus("1765674331.355").abs().lt(0.01)).toBe(true);

    const all = consolidateCash(Object.values(by), c.settings.minimumCash);
    expect(all.pnl.profitBeforeTax.minus("178887181728.20").abs().lt(1)).toBe(true);
    near(all.pnl.tax.months.slice(0, 1), ["3279598331.68"]);
    near(all.rows.receipts.slice(0, 3), ["20823092606.29", "0", "27763568757.00"]);
    near(all.rows.closing, ["2879831055.09", "-45074810899.60", "-43790616324.54", "-65233044306.65", "-59189527266.59", "-65871985019.53", "-59015320760.47", "-61359353095.40", "-83396525430.34", "-97438766734.28", "-41525538588.22", "-60670001773.15"]);
    near([all.rows.fundingNeed.reduce((a, b) => (b.gt(a) ? b : a))], ["104438766734.28"]);
  });

  it("exports all 192 lines and reads them back to the same totals", async () => {
    const buf = await writeRkaWorkbook({
      year: 2027,
      title: "RKA 2027 v2 Upd Fin",
      lines: lines.map((l) => ({ ...l, status: "Draft", sourceRef: null })),
      divisionOf: (u) => org.divisionOf(u),
      pnlLabel: { Revenue: "Revenue", COGS: "COGS", GrossProfit: "GP", OPEX: "OPEX", OperatingProfit: "OP", OTHERS: "OTHERS", ProfitBeforeTax: "PBT", CAPEX: "CAPEX", TotalCost: "Total" },
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const back = parseRkaData(sheetRows(wb, "RKA 2027 Data"), ORG_UNITS);
    expect(back.problems).toEqual([]);
    const totals = pnl(asSummary(back.lines));
    expect(["Revenue", "TotalCost"].map((k) => totals.find((r) => r.key === k)!.total.toFixed(2))).toEqual(["457830698346.00", "294445936589.71"]);
    expect(back.lines.filter((l) => l.crossDivision)).toHaveLength(46);
  });
});
