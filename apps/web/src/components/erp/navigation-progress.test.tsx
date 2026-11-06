import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

let pathname = "/coa";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const { NavigationProgress } = await import("./navigation-progress");

const page = () =>
  render(
    <>
      <NavigationProgress />
      <a href="/summary">Summary</a>
      <a href="/coa">COA</a>
      <a href="/summary" target="_blank">Tab baru</a>
      <a href="https://example.com/">Luar</a>
      <a href="/api/export/rka" download>
        Unduh
      </a>
    </>,
  );
const bar = () => screen.queryByRole("progressbar", { name: "Memuat halaman" });
// Links in tests have no router; stop jsdom from trying to navigate.
const click = (name: string, init: MouseEventInit = {}) => {
  const link = screen.getByText(name);
  link.addEventListener("click", (e) => e.preventDefault(), { once: true });
  fireEvent.click(link, { button: 0, ...init });
};

describe("NavigationProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pathname = "/coa";
    window.history.replaceState({}, "", "/coa");
  });
  afterEach(() => vi.useRealTimers());

  it("starts when a link to another page is clicked, and creeps forward while it loads", () => {
    page();
    expect(bar()).toBeNull();
    click("Summary");
    const start = Number(bar()!.getAttribute("aria-valuenow"));
    act(() => vi.advanceTimersByTime(1500));
    const later = Number(bar()!.getAttribute("aria-valuenow"));
    expect(later).toBeGreaterThan(start);
    expect(later).toBeLessThan(100);
  });

  it("fills and disappears once the new page is in", () => {
    const { rerender } = page();
    click("Summary");
    pathname = "/summary";
    rerender(
      <>
        <NavigationProgress />
        <a href="/summary">Summary</a>
      </>,
    );
    expect(bar()!.getAttribute("aria-valuenow")).toBe("100");
    act(() => vi.advanceTimersByTime(600));
    expect(bar()).toBeNull();
  });

  it("stays quiet for the current page, new tabs, other sites and downloads", () => {
    page();
    click("COA");
    click("Tab baru");
    click("Luar");
    click("Unduh");
    click("Summary", { ctrlKey: true });
    expect(bar()).toBeNull();
  });
});

describe("NavigationProgress safety stop", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("finishes on its own when a page never arrives", () => {
    pathname = "/coa";
    page();
    click("Summary");
    act(() => vi.advanceTimersByTime(10_000));
    expect(bar()!.getAttribute("aria-valuenow")).toBe("100");
    act(() => vi.advanceTimersByTime(600));
    expect(bar()).toBeNull();
  });
});
