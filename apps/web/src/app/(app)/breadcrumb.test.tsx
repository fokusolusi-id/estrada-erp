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
});
