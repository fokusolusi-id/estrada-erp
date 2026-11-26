import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { NavItem } from "@/lib/nav";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/panduan" }));

const items = [
  { href: "/", label: "Beranda", icon: "home" },
  { href: "/panduan", label: "Panduan", icon: "guide" },
] as unknown as NavItem[];

/** jsdom lays nothing out: the menu shows 100–200 px, the active link sits where the test puts it. */
const layout = (top: number, bottom: number) =>
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return (this.tagName === "NAV" ? { top: 100, bottom: 200 } : { top, bottom }) as DOMRect;
  });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Sidebar", () => {
  it("scrolls the menu down to the active page when it sits below the window", () => {
    layout(230, 260);
    render(<Sidebar items={items} defaultCollapsed={false} />);
    expect(screen.getByRole("navigation", { name: "Menu utama" }).scrollTop).toBe(60);
  });

  it("leaves the menu where it is when the active page already shows", () => {
    layout(120, 150);
    render(<Sidebar items={items} defaultCollapsed={false} />);
    expect(screen.getByRole("navigation", { name: "Menu utama" }).scrollTop).toBe(0);
  });
});
