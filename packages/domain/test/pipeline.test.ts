import { describe, expect, it } from "vitest";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import { canPipeline, dealProblems, pipelineBySegment, statusBand, weighted, type DealInput } from "../src/pipeline";

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
    expect([statusBand("PP"), statusBand("PT"), statusBand("QO"), statusBand("WB")]).toEqual([
      [0, 30],
      [30, 60],
      [60, 70],
      [70, 90],
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
