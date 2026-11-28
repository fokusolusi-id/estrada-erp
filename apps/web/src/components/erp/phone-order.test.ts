import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(__dirname, "../..", path), "utf8");

describe("phone layout", () => {
  it("puts the Summary tables before the charts", () => {
    expect(read("app/(app)/summary/page.tsx")).toContain("max-sm:order-last");
  });

  it("keeps the first column of the Beranda tables in view while scrolling sideways", () => {
    expect(read("components/erp/home-widgets.tsx")).toContain("[&_td:first-child]:sticky");
    expect(read("components/erp/progress-board.tsx")).toContain("[&_td:first-child]:sticky");
  });
});
