import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SectionTabs } from "./section-tabs";

const tabs = [
  { key: "bulan", label: "Per bulan", content: <p>isi bulan</p> },
  { key: "divisi", label: "Per divisi", content: <p>isi divisi</p> },
];
const panel = () => screen.getByRole("tabpanel").textContent;

describe("SectionTabs", () => {
  it("shows one section at a time", () => {
    render(<SectionTabs label="Rincian" tabs={tabs} />);
    expect(panel()).toBe("isi bulan");
    fireEvent.click(screen.getByRole("tab", { name: "Per divisi" }));
    expect(panel()).toBe("isi divisi");
    expect(screen.getByRole("tab", { name: "Per divisi" }).getAttribute("aria-selected")).toBe("true");
  });

  it("moves with the arrow keys, wrapping round", () => {
    render(<SectionTabs label="Rincian" tabs={tabs} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Per bulan" }), { key: "ArrowLeft" });
    expect(panel()).toBe("isi divisi");
    expect(document.activeElement?.textContent).toBe("Per divisi");
  });
});
