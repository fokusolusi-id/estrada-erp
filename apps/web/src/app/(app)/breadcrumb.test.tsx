import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { navFor } from "@/lib/nav";
import { Breadcrumb } from "./breadcrumb";

let path = "/rka/line/abc";
vi.mock("next/navigation", () => ({ usePathname: () => path }));

describe("Breadcrumb", () => {
  it("shows the group and screen, linking back from a page below it", () => {
    render(<Breadcrumb items={navFor("finance")} />);
    const nav = screen.getByRole("navigation", { name: "Lokasi" });
    expect(nav.textContent).toContain("Anggaran");
    expect(screen.getByRole("link", { name: "Daftar Baris RKA" }).getAttribute("href")).toBe("/rka");
  });

  it("marks the screen itself as the current page, without a link", () => {
    path = "/summary";
    render(<Breadcrumb items={navFor("finance")} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Management Summary").getAttribute("aria-current")).toBe("page");
  });

  it("gives the view-as chip its own row under the header on a phone", () => {
    const layout = readFileSync(join(__dirname, "layout.tsx"), "utf8");
    expect(layout).toContain("flex-wrap");
    expect(layout).toContain("max-md:order-last max-md:basis-full");
  });

  it("sits in the page column above the title, not in the header bar", () => {
    const layout = readFileSync(join(__dirname, "layout.tsx"), "utf8");
    const at = layout.indexOf("<Breadcrumb");
    expect(at).toBeGreaterThan(layout.indexOf("<div data-page"));
    expect(layout.indexOf("{children}", at)).toBeGreaterThan(at);
  });
});
