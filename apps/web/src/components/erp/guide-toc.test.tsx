import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { GuideToc } from "./guide-toc";

type Entry = { target: Element; isIntersecting: boolean };
let report: (entries: Entry[]) => void = () => {};

beforeEach(() => {
  // jsdom has no IntersectionObserver; this one hands the test the callback.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: Entry[]) => void) {
        report = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  document.body.innerHTML = "";
});
afterEach(() => vi.unstubAllGlobals());

const sections = [
  { id: "alur-rka", title: "Alur RKA" },
  { id: "peran-dan-akses", title: "Peran dan akses" },
  { id: "memulai", title: "Memulai" },
];
const setup = () => {
  render(
    <>
      <GuideToc sections={sections} />
      {sections.map((s) => (
        <h2 key={s.id} id={s.id}>
          {s.title}
        </h2>
      ))}
    </>,
  );
  return (id: string) => document.getElementById(id)!;
};
const current = () => screen.getAllByRole("link").find((a) => a.getAttribute("aria-current") === "location")?.textContent;

describe("GuideToc", () => {
  it("marks the first section until the reader scrolls", () => {
    setup();
    expect(current()).toBe("Alur RKA");
  });

  it("follows the section whose heading the reader has scrolled to", () => {
    const heading = setup();
    act(() => report([{ target: heading("peran-dan-akses"), isIntersecting: true }]));
    expect(current()).toBe("Peran dan akses");
  });

  it("picks the topmost section when several headings are in view", () => {
    const heading = setup();
    act(() =>
      report([
        { target: heading("memulai"), isIntersecting: true },
        { target: heading("peran-dan-akses"), isIntersecting: true },
      ]),
    );
    expect(current()).toBe("Peran dan akses");
  });
});
