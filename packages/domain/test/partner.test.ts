import { describe, expect, it } from "vitest";
import { nextProductId, partnerIssues, type PartnerRecord } from "../src/partner";

const partner = (over: Partial<PartnerRecord> & { id: string }): PartnerRecord => ({
  npwp: over.id.replace(/\D/g, "") || "1",
  email: null,
  picEmail: null,
  ...over,
});
const issues = (list: PartnerRecord[]) => partnerIssues(list).map((i) => `${i.id} ${i.code}`);

describe("partnerIssues (Master Mitra, BR-MD-005)", () => {
  it("warns when the NPWP is empty: a partner needs it to be transacted with", () => {
    expect(issues([partner({ id: "Mitra-004", npwp: null })])).toEqual(["Mitra-004 npwp_missing"]);
  });

  it("flags an NPWP two partners share", () => {
    expect(issues([partner({ id: "A", npwp: "1" }), partner({ id: "B", npwp: "1" })])).toEqual(["A same_npwp", "B same_npwp"]);
  });

  it("flags the placeholder address @lixabluepower.id (Mitra-004..008)", () => {
    expect(issues([partner({ id: "Mitra-004", email: "@lixabluepower.id" })])).toEqual(["Mitra-004 email_invalid"]);
  });

  it("flags an email two partners share (Mitra-003 copied from Mitra-002)", () => {
    const list = ["Mitra-002", "Mitra-003"].map((id) => partner({ id, email: "sales@lixabluepower.id" }));
    expect(issues(list)).toEqual(["Mitra-002 email_shared", "Mitra-003 email_shared"]);
  });
});

describe("nextProductId (Master Produk Mitra: a product has its own ID)", () => {
  it("numbers after the highest ID in use", () => {
    expect(nextProductId([])).toBe("Produk-001");
    expect(nextProductId(["Produk-002", "Produk-010"])).toBe("Produk-011");
  });
});
