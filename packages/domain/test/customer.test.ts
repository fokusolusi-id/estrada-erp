import { describe, expect, it } from "vitest";
import { PLACEHOLDER_NPWP, cleanNpwp, customerIssues, matchCustomer, splitDuplicateNpwp, type CustomerRecord } from "../src/customer";

const customer = (over: Partial<CustomerRecord> & { id: string }): CustomerRecord => ({
  nickname: over.id,
  legalName: `PT ${over.id}`,
  segment: "Telco",
  npwp: null,
  email: null,
  picEmail: null,
  ...over,
});

describe("cleanNpwp (M Customer)", () => {
  it("keeps digits only, dropping punctuation and hidden Unicode", () => {
    expect(cleanNpwp("01.000.013.1-093.000​")).toBe("010000131093000");
  });
  it("is null when nothing is typed", () => {
    expect(cleanNpwp(" - ")).toBeNull();
  });
});

describe("splitDuplicateNpwp (BR-MD-004: no duplicate customer by NPWP)", () => {
  it("rejects the second customer with an NPWP already used, and says whose it is", () => {
    const { accepted, rejected } = splitDuplicateNpwp([
      customer({ id: "Cust-001", npwp: "010000131093000" }),
      customer({ id: "Cust-002", npwp: "010000131093000" }),
    ]);
    expect(accepted.map((c) => c.id)).toEqual(["Cust-001"]);
    expect(rejected).toEqual([{ id: "Cust-002", npwp: "010000131093000", takenBy: "Cust-001" }]);
  });

  it("rejects an NPWP another customer in the database holds, but not the same customer reloaded", () => {
    const existing = [{ id: "Cust-001", npwp: "010000131093000" }];
    const { accepted, rejected } = splitDuplicateNpwp(
      [customer({ id: "Cust-001", npwp: "010000131093000" }), customer({ id: "Cust-099", npwp: "010000131093000" })],
      existing,
    );
    expect(accepted.map((c) => c.id)).toEqual(["Cust-001"]);
    expect(rejected.map((r) => r.id)).toEqual(["Cust-099"]);
  });

  it("lets the placeholder NPWP and a missing NPWP repeat", () => {
    const { accepted, rejected } = splitDuplicateNpwp([
      customer({ id: "Cust-004", npwp: PLACEHOLDER_NPWP }),
      customer({ id: "Cust-005", npwp: PLACEHOLDER_NPWP }),
      customer({ id: "Cust-006" }),
      customer({ id: "Cust-007" }),
    ]);
    expect(accepted).toHaveLength(4);
    expect(rejected).toEqual([]);
  });
});

describe("customerIssues (review list, plan section 6)", () => {
  const issues = (list: CustomerRecord[]) => customerIssues(list).map((i) => `${i.id} ${i.code}`);

  it("flags the placeholder NPWP and a missing one", () => {
    expect(issues([customer({ id: "A", npwp: PLACEHOLDER_NPWP }), customer({ id: "B" })])).toEqual(["A npwp_placeholder", "B npwp_missing"]);
  });

  it("flags two records with the same legal name (Cust-005 and Cust-007)", () => {
    const list = ["Cust-005", "Cust-007"].map((id) => customer({ id, npwp: id, legalName: "Kementerian Pendidikan Dasar dan Menengah", segment: "K/L" }));
    expect(issues(list)).toEqual(["Cust-005 same_name", "Cust-007 same_name"]);
  });

  it("flags a ministry tagged Telco", () => {
    expect(issues([customer({ id: "A", npwp: "1", legalName: "Direktorat Jenderal Imigrasi" })])).toEqual(["A segment_suspect"]);
  });

  it("flags invalid emails without changing them", () => {
    const list = [
      customer({ id: "A", npwp: "1", email: "email@korlantas..id" }),
      customer({ id: "B", npwp: "2", picEmail: "email@tpi soetta.co.id" }),
      customer({ id: "C", npwp: "3", email: "email@telkom.co.id" }),
    ];
    expect(issues(list)).toEqual(["A email_invalid", "B email_invalid"]);
  });
});

describe("matchCustomer (BR-SP-002: pipeline links to Master Customer)", () => {
  const master = [
    { id: "Cust-001", nickname: "Telkom", legalName: "PT Telkom Indonesia" },
    { id: "Cust-005", nickname: "kemendikdasmen", legalName: "Kementerian Pendidikan Dasar dan Menengah" },
    { id: "Cust-007", nickname: "Kemendikdasmen", legalName: "Kementerian Pendidikan Dasar dan Menengah" },
  ];

  it("matches the nickname or the legal name, ignoring case and spacing", () => {
    expect(matchCustomer(" telkom ", master)).toBe("Cust-001");
    expect(matchCustomer("PT  Telkom Indonesia", master)).toBe("Cust-001");
  });

  it("does not guess: a part of a name, an unknown name or a blank stays unmatched", () => {
    expect(matchCustomer("Telkom Mojokerto", master)).toBeNull();
    expect(matchCustomer("Icon", master)).toBeNull();
    expect(matchCustomer(" ", master)).toBeNull();
  });

  it("leaves a name two customers share to BCD (Cust-005 and Cust-007)", () => {
    expect(matchCustomer("Kemendikdasmen", master)).toBeNull();
  });
});
