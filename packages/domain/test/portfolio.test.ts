import { describe, expect, it } from "vitest";
import { money } from "../src/money";
import { OrgTree } from "../src/org";
import { canEditHighlight, canViewDashboard, canViewPortfolio, deliveryHealth, lifecycle, portfolioFigures } from "../src/portfolio";
import { stressCashIn } from "../src/kpi-health";

describe("lifecycle (FC10; BR-PRT-002)", () => {
  it("classifies from the project status", () => {
    expect((["Initiation", "Pengadaan_Barang", "Implementasi", "Penagihan", "Layanan", "Garansi", "Closing", "Drop"] as const).map(lifecycle)).toEqual([
      "won", "active", "active", "active", "active", "active", "closed", "drop",
    ]);
  });
});

describe("deliveryHealth", () => {
  const site = { status: "Instalasi", plannedDoneOn: "2027-08-01", actualDoneOn: null };
  const base = { status: "Implementasi" as const, rfsOn: null, rfsTargetOn: "2027-08-01", sites: [site] };
  const today = "2027-06-01";
  it("is on track without a late or blocked site", () => expect(deliveryHealth(base, today)).toBe("on_track"));
  it("is delayed past the RFS target or a site's planned date", () => {
    expect(deliveryHealth({ ...base, rfsTargetOn: "2027-05-31" }, today)).toBe("delayed");
    expect(deliveryHealth({ ...base, sites: [{ ...site, plannedDoneOn: "2027-05-31" }] }, today)).toBe("delayed");
    expect(deliveryHealth({ ...base, sites: [{ ...site, plannedDoneOn: "2027-05-31", actualDoneOn: "2027-05-30" }] }, today)).toBe("on_track");
  });
  it("is at risk with a blocked site or an RFS target within 14 days", () => {
    expect(deliveryHealth({ ...base, sites: [{ ...site, status: "Terkendala" }] }, today)).toBe("at_risk");
    expect(deliveryHealth({ ...base, rfsTargetOn: "2027-06-15" }, today)).toBe("at_risk");
    expect(deliveryHealth({ ...base, rfsTargetOn: "2027-06-15", rfsOn: "2027-05-20" }, today)).toBe("on_track");
  });
  it("says nothing for closed or dropped projects", () => {
    expect(deliveryHealth({ ...base, status: "Closing" }, today)).toBeNull();
    expect(deliveryHealth({ ...base, status: "Drop" }, today)).toBeNull();
  });
});

describe("portfolioFigures (FC10; BR-PRT-001)", () => {
  it("works out gross profit and GP%", () => {
    const f = portfolioFigures(money("200"), money("150"));
    expect([f.grossProfit.toString(), f.gpPct?.toString()]).toEqual(["50", "25"]);
  });
  it("has no GP% without revenue", () => expect(portfolioFigures(money("0"), money("10")).gpPct).toBeNull());
});

describe("BOD access (sheet 18_Dashboard_Spec_BOD RBAC; FC11)", () => {
  const org = new OrgTree([
    { code: "FRM", parent: null },
    { code: "BCD", parent: null },
  ]);
  const actor = (role: "director" | "auditor" | "finance" | "division_owner", orgUnit = "BCD", entities = ["*"]) => ({ userId: "u", role, orgUnit, entities });
  it("opens the dashboard to Direktur, Auditor and the Head of FRM only", () => {
    expect([actor("director"), actor("auditor"), actor("division_owner", "FRM"), actor("division_owner"), actor("finance", "FRM")].map((a) => canViewDashboard(a, org))).toEqual([true, true, true, false, false]);
  });
  it("opens the portfolio to Finance as well", () => expect(canViewPortfolio(actor("finance", "FRM"), org)).toBe(true));
  it("lets a Direktur write highlights for their own companies, the Head of FRM too, never the auditor", () => {
    const pt = actor("director", "BCD", ["ESTRADA"]);
    expect([canEditHighlight(pt, ["ESTRADA"], org), canEditHighlight(pt, ["ESTRADA", "PAS"], org), canEditHighlight(actor("division_owner", "FRM"), ["PAS"], org), canEditHighlight(actor("auditor"), ["PAS"], org)]).toEqual([true, false, true, false]);
  });
});

describe("stress slider", () => {
  it("takes another drop", () => expect(stressCashIn({ closing: [money("100")], receipts: [money("50")] }, 50).lowest.toString()).toBe("75"));
});
