import { describe, expect, it } from "vitest";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import { billingPlan, canPipeline, canRecoveryPlan, dealProblems, duplicateProject, duplicateProjects, needsRecovery, pipelineByCoa, pipelineBySegment, statusBand, weighted, type DealInput } from "../src/pipeline";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "BCD", parent: "DIR" },
  { code: "SPA", parent: "BCD" },
  { code: "PDMS", parent: "DIR" },
  { code: "SCM", parent: "PDMS" },
  { code: "FRM", parent: "DIR" },
]);
const actor = (over: Partial<Actor>): Actor => ({ userId: "u", role: "requestor", orgUnit: "BCD", entities: ["*"], ...over });

// Pipeline sheet row 3: Telkom / Korlantas SBST Online, Rp 577.320.000 at 90%.
const deal: DealInput = {
  entity: "ESTRADA",
  customer: "Telkom",
  endCustomer: "Korlantas",
  segment: "Telco Business",
  project: "Perpanjangan Pengadaan Sewa CPE Untuk Sewa Jaringan SBST Online Korlantas Polri TA 2027",
  coaCode: "4100",
  value: "577320000",
  status: "WB",
  probability: "90",
  type: "renewal",
  startMonth: 1,
  endMonth: 12,
};

describe("weighted: value excluding PPN times probability, as the sheet's own column", () => {
  it("weights Rp 577.320.000 at 90% to Rp 519.588.000", () => {
    expect(weighted(deal).toFixed(2)).toBe("519588000.00");
  });
});

describe("statusBand: the sheet's legend", () => {
  it("gives each status its probability band", () => {
    expect([statusBand("PP"), statusBand("PT"), statusBand("QO"), statusBand("WB"), statusBand("CW")]).toEqual([
      [0, 30],
      [30, 60],
      [60, 70],
      [70, 90],
      [100, 100],
    ]);
  });
});

describe("dealProblems: what a deal must have", () => {
  it("accepts a complete deal", () => {
    expect(dealProblems(deal)).toEqual([]);
  });

  it("names every missing or impossible field", () => {
    const bad = { ...deal, customer: " ", project: "", value: "0", probability: "120", startMonth: 9, endMonth: 3 };
    expect(dealProblems(bad).map((p) => p.field).sort()).toEqual(["customer", "months", "probability", "project", "value"]);
  });

  it("warns, without blocking, when the probability sits outside its status band", () => {
    expect(dealProblems({ ...deal, status: "PP", probability: "90" })).toEqual([{ field: "probability", code: "outside_band", blocking: false }]);
  });
});

describe("pipelineBySegment: segment targets against weighted pipeline", () => {
  it("adds deals per segment and keeps segments with a target but no deals", () => {
    const deals = [deal, { ...deal, value: "1000000000", probability: "10", status: "PP" as const }, { ...deal, segment: "Government Business", value: "200", probability: "50" }];
    const rows = pipelineBySegment(deals, new Map([["Telco Business", money("250000000000")], ["Territory Business", money("20000000000")]]));
    expect(rows.map((r) => [r.segment, r.deals, r.value.toFixed(0), r.weighted.toFixed(0), r.target?.toFixed(0) ?? null])).toEqual([
      ["Telco Business", 2, "1577320000", "619588000", "250000000000"],
      ["Government Business", 1, "200", "100", null],
      ["Territory Business", 0, "0", "0", "20000000000"],
    ]);
  });
});

describe("canPipeline: BCD keeps the register; Finance, Direktur and Auditor read it", () => {
  it("lets BCD's requestor, default owner and division owner edit, within their entities", () => {
    for (const role of ["requestor", "default_owner", "division_owner"] as const) {
      expect(canPipeline(actor({ role }), "edit", "MATRIK", org)).toBe(true);
      expect(canPipeline(actor({ role, orgUnit: "SPA" }), "edit", "MATRIK", org)).toBe(true);
    }
    expect(canPipeline(actor({ entities: ["ESTRADA"] }), "edit", "MATRIK", org)).toBe(false);
  });

  it("keeps other divisions out, and gives Finance, Direktur and Auditor read access only", () => {
    expect(canPipeline(actor({ orgUnit: "SCM" }), "view", null, org)).toBe(false);
    expect(canPipeline(actor({ role: "division_owner", orgUnit: "PDMS" }), "view", null, org)).toBe(false);
    for (const role of ["finance", "director", "auditor"] as const) {
      expect(canPipeline(actor({ role, orgUnit: "FRM" }), "view", null, org)).toBe(true);
      expect(canPipeline(actor({ role, orgUnit: "FRM" }), "edit", "ESTRADA", org)).toBe(false);
    }
    expect(canPipeline(actor({ role: "admin", orgUnit: "BCD" }), "view", null, org)).toBe(false);
  });
});

// Kontrol RKA, titik sambung 1, 3 and 6: COA pendapatan wajib, lead time, Kode Proyek unik per tahun dan entitas.
describe("dealProblems: the RKA controls on a deal", () => {
  it("requires the revenue COA", () => {
    expect(dealProblems({ ...deal, coaCode: null })).toEqual([{ field: "coa", code: "required", blocking: true }]);
  });

  it("accepts a lead time of 0 to 24 whole months and rejects anything else", () => {
    expect(dealProblems({ ...deal, leadTimeMonths: 3 })).toEqual([]);
    expect(dealProblems({ ...deal, leadTimeMonths: 30 })).toEqual([{ field: "leadTime", code: "out_of_range", blocking: true }]);
    expect(dealProblems({ ...deal, leadTimeMonths: 1.5 })).toEqual([{ field: "leadTime", code: "out_of_range", blocking: true }]);
  });

  it("finds a project name already used in the same entity, ignoring case and spacing", () => {
    const others = [{ entity: "ESTRADA", project: "  perpanjangan pengadaan sewa CPE untuk sewa jaringan  SBST online korlantas polri TA 2027" }];
    expect(duplicateProject(deal, others)).toBe(true);
    expect(duplicateProject({ ...deal, entity: "MATRIK" }, others)).toBe(false);
    expect(duplicateProjects([deal, { ...deal }, { ...deal, project: "Lain" }]).map((g) => g.length)).toEqual([2]);
  });
});

// Kontrol RKA temuan 1 and 4: both bases side by side, and coverage against the segment target.
describe("pipelineBySegment: seluruh pipeline beside Won Bidding saja, with coverage", () => {
  // Enterprise Business: target Rp 30 miliar, one Potential deal of Rp 4,5 miliar.
  const enterprise = { ...deal, segment: "Enterprise Business", value: "4500000000", status: "PT" as const, probability: "30" };
  const rows = pipelineBySegment([deal, { ...deal, value: "1000000000", status: "PP" as const, probability: "10" }, enterprise], new Map([["Telco Business", money("600000000")], ["Enterprise Business", money("30000000000")]]));

  it("counts Won Bidding deals apart from the whole pipeline", () => {
    expect(rows.map((r) => [r.segment, r.deals, r.wonDeals, r.wonValue.toFixed(0)])).toEqual([
      ["Telco Business", 2, 1, "577320000"],
      ["Enterprise Business", 1, 0, "0"],
    ]);
  });

  it("gives coverage as weighted over target and flags a segment below 1,0x", () => {
    expect(rows.map((r) => [r.coverage?.toFixed(2), needsRecovery(r)])).toEqual([
      ["1.03", false],
      ["0.05", true],
    ]);
    expect(needsRecovery(pipelineBySegment([deal], new Map())[0]!)).toBe(false);
  });
});

describe("pipelineByCoa: pendapatan per COA from the pipeline", () => {
  it("sums value and weighted per revenue COA, codes in order, deals without one last", () => {
    const rows = pipelineByCoa([{ ...deal, coaCode: "4200", value: "100", probability: "50" }, deal, { ...deal, coaCode: null, value: "10", probability: "10" }, { ...deal, value: "1000", probability: "100" }]);
    expect(rows.map((r) => [r.coaCode, r.deals, r.value.toFixed(0), r.weighted.toFixed(0)])).toEqual([
      ["4100", 2, "577321000", "519589000"],
      ["4200", 1, "100", "50"],
      [null, 1, "10", "1"],
    ]);
  });
});

// Kontrol RKA temuan 2 and 3: Closed Won needs Billing Termin for 100% of the contract; the invoice plan is their sum.
describe("Billing Termin", () => {
  const won = { ...deal, status: "CW" as const, probability: "100", value: "1000000000" };
  const termins = [
    { amount: "300000000", plannedDate: "2027-03-15" },
    { amount: "400000000", plannedDate: "2027-09-01" },
    { amount: "300000000", plannedDate: "2028-01-20" },
  ];

  it("blocks Closed Won until the termin add up to the contract value", () => {
    expect(dealProblems({ ...won, termins: termins.slice(0, 2) })).toEqual([{ field: "termin", code: "termin_total", blocking: true }]);
    expect(dealProblems({ ...won, termins: [] })).toEqual([{ field: "termin", code: "termin_total", blocking: true }]);
    expect(dealProblems({ ...won, termins })).toEqual([]);
  });

  it("lets an open deal plan part of its termin, never more than the contract, each with an amount and a date", () => {
    expect(dealProblems({ ...deal, value: "1000000000", termins: termins.slice(0, 1) })).toEqual([]);
    expect(dealProblems({ ...deal, value: "500000000", termins })).toEqual([{ field: "termin", code: "termin_over", blocking: true }]);
    expect(dealProblems({ ...deal, termins: [{ amount: "0", plannedDate: "2027-02-30" }] })).toEqual([{ field: "termin", code: "out_of_range", blocking: true }]);
  });

  it("derives the monthly invoice plan from the termin, so the summary is always the sum of the detail", () => {
    const plan = billingPlan([{ ...won, termins }, { ...deal, termins: [{ amount: "77320000", plannedDate: "2027-03-01" }] }, deal], 2027);
    expect(plan.months.map((m) => m.toFixed(0))).toEqual(["0", "0", "377320000", "0", "0", "0", "0", "0", "400000000", "0", "0", "0"]);
    expect(plan.total.toFixed(0)).toBe("777320000");
    expect(plan.rows.map((r) => [r.contract.toFixed(0), r.thisYear.toFixed(0), r.carried.toFixed(0)])).toEqual([
      ["1000000000", "700000000", "300000000"],
      ["577320000", "77320000", "500000000"],
    ]);
    expect(plan.rows.reduce((a, r) => a.plus(r.thisYear), money("0")).eq(plan.total)).toBe(true);
  });
});

describe("canRecoveryPlan: the Sales Head (BCD's division owner) writes the recovery plan", () => {
  it("allows only a division owner within BCD", () => {
    expect(canRecoveryPlan(actor({ role: "division_owner" }), org)).toBe(true);
    expect(canRecoveryPlan(actor({ role: "requestor" }), org)).toBe(false);
    expect(canRecoveryPlan(actor({ role: "division_owner", orgUnit: "PDMS" }), org)).toBe(false);
    expect(canRecoveryPlan(actor({ role: "finance", orgUnit: "FRM" }), org)).toBe(false);
  });
});
