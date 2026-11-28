import { describe, expect, it } from "vitest";
import { navFor, whereAmI } from "./nav";

describe("navFor", () => {
  it("shows a requestor their own RKA and payment requests", () => {
    expect(navFor("requestor").map((n) => n.href)).toEqual(["/", "/rka", "/pembayaran", "/master", "/panduan"]);
  });

  it("gives Finance a way into the line list, under its own name", () => {
    expect(navFor("finance").find((n) => n.href === "/rka")?.label).toBe("Daftar Baris RKA");
    expect(navFor("requestor").find((n) => n.href === "/rka")?.label).toBe("RKA Saya");
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
    expect(navFor("requestor", bcd).map((n) => n.href)).toEqual(["/", "/rka", "/pembayaran", "/tracker-telkom", "/implementasi", "/pipeline", "/pipeline/sph", "/master", "/panduan"]);
    expect(navFor("division_owner", () => false).map((n) => n.href)).not.toContain("/pipeline");
    for (const role of ["finance", "director", "auditor"] as const) expect(navFor(role).map((n) => n.href)).toContain("/pipeline");
  });

  it("shows Implementasi to PDMS and BCD and to Finance, Direktur and Auditor, not to other divisions", () => {
    expect(navFor("requestor", (unit) => unit === "PDMS").map((n) => n.href)).toEqual(["/", "/rka", "/pembayaran", "/tracker-telkom", "/implementasi", "/pengadaan", "/master", "/panduan"]);
    expect(navFor("default_owner", () => false).map((n) => n.href)).not.toContain("/implementasi");
    for (const role of ["finance", "director", "auditor"] as const) expect(navFor(role).map((n) => n.href)).toContain("/implementasi");
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

describe("menu entries", () => {
  it("lists each screen once, even when two rules both let a position in", () => {
    for (const role of ["requestor", "default_owner", "division_owner", "finance", "director", "auditor", "admin", "bfp", "cash_manager"] as const) {
      const hrefs = navFor(role, () => true).map((n) => n.href);
      expect(hrefs).toEqual([...new Set(hrefs)]);
    }
  });
});

describe("whereAmI", () => {
  const items = navFor("finance");

  it("names the menu group and screen for the page, taking the longest match", () => {
    expect(whereAmI("/rka/review", items)).toEqual({ group: "Anggaran", label: "Status Board Finance", href: "/rka/review", deeper: false });
    expect(whereAmI("/", items)?.label).toBe("Beranda");
  });

  it("says when the page sits below a menu screen", () => {
    expect(whereAmI("/rka/line/abc", items)).toEqual({ group: "Anggaran", label: "Daftar Baris RKA", href: "/rka", deeper: true });
  });

  it("is silent for a page outside the menu", () => {
    expect(whereAmI("/tidak-ada", items)).toBeNull();
  });
});

describe("report groups", () => {
  it("splits the long report menu, keeping each group together and no longer than seven", () => {
    const items = navFor("finance");
    const groups = items.map((i) => i.group).filter((g, i, all) => g !== all[i - 1]);
    expect(groups).toEqual([...new Set(groups)]);
    expect(groups).toEqual(expect.arrayContaining(["Kinerja", "Penjualan", "Kas", "Kontrol"]));
    for (const g of ["Kinerja", "Penjualan", "Kas", "Kontrol"]) expect(navFor("director").filter((i) => i.group === g).length).toBeLessThanOrEqual(7);
    expect(items.some((i) => (i.group as string) === "Laporan")).toBe(false);
  });
});
