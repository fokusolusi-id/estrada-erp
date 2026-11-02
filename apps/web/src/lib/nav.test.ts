import { describe, expect, it } from "vitest";
import { navFor } from "./nav";

describe("navFor", () => {
  it("shows a requestor only their own RKA", () => {
    expect(navFor("requestor").map((n) => n.href)).toEqual(["/", "/rka"]);
  });

  it("keeps budget screens away from Admin", () => {
    const hrefs = navFor("admin").map((n) => n.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/admin/users", "/admin/positions"]));
    expect(hrefs).not.toContain("/coa");
    expect(hrefs).not.toContain("/rka");
  });

  it("gives the Director the summary and cash views", () => {
    const hrefs = navFor("director").map((n) => n.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/summary", "/cash"]));
  });

  it("gives each approver their live queue", () => {
    const live = (role: Parameters<typeof navFor>[0]) => navFor(role).filter((n) => !n.phase).map((n) => n.href);
    expect(live("default_owner")).toContain("/rka/queue");
    expect(live("division_owner")).toContain("/rka/division");
    expect(live("finance")).toEqual(expect.arrayContaining(["/rka/review", "/rka/lock", "/coa"]));
    expect(live("director")).toEqual(expect.arrayContaining(["/rka/lock", "/summary"]));
    expect(live("auditor")).toContain("/summary");
    expect(live("finance")).toContain("/rka/cycle");
    expect(live("director")).toContain("/rka/cycle");
    expect(live("requestor")).not.toContain("/rka/cycle");
  });
});
