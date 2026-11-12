import { describe, expect, it } from "vitest";
import { navFor } from "./nav";

describe("navFor", () => {
  it("shows a requestor their own RKA and payment requests", () => {
    expect(navFor("requestor").map((n) => n.href)).toEqual(["/", "/rka", "/pembayaran", "/panduan"]);
  });

  it("keeps budget screens away from Admin", () => {
    const hrefs = navFor("admin").map((n) => n.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/admin/users", "/admin/master", "/admin/positions"]));
    expect(hrefs).not.toContain("/coa");
    expect(hrefs).not.toContain("/rka");
  });

  it("gives the Director the summary and cash views", () => {
    const hrefs = navFor("director").map((n) => n.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/summary", "/cash"]));
  });

  it("shows Pipeline to BCD's people and to Finance, Direktur and Auditor, not to other divisions", () => {
    const bcd = (unit: string) => unit === "BCD";
    expect(navFor("requestor", bcd).map((n) => n.href)).toEqual(["/", "/rka", "/pembayaran", "/pipeline", "/panduan"]);
    expect(navFor("division_owner", () => false).map((n) => n.href)).not.toContain("/pipeline");
    for (const role of ["finance", "director", "auditor"] as const) expect(navFor(role).map((n) => n.href)).toContain("/pipeline");
  });

  it("gives every role the Panduan", () => {
    for (const role of ["requestor", "default_owner", "division_owner", "finance", "director", "auditor", "admin"] as const) {
      expect(navFor(role).at(-1)?.href).toBe("/panduan");
    }
  });

  it("gives each approver their live queue", () => {
    const live = (role: Parameters<typeof navFor>[0]) => navFor(role).filter((n) => !n.phase).map((n) => n.href);
    expect(live("default_owner")).toContain("/rka/queue");
    expect(live("division_owner")).toContain("/rka/division");
    expect(live("finance")).toEqual(expect.arrayContaining(["/rka/review", "/rka/lock", "/coa", "/rka/actual", "/rka/allocation"]));
    expect(live("director")).toEqual(expect.arrayContaining(["/rka/lock", "/summary"]));
    expect(live("auditor")).toContain("/summary");
    expect(live("auditor")).toContain("/cash");
    expect(live("finance")).toContain("/rka/cycle");
    expect(live("director")).toContain("/rka/cycle");
    expect(live("requestor")).not.toContain("/rka/cycle");
  });
});
