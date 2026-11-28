import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("skip link", () => {
  it("jumps past the menu and header to the page", () => {
    const layout = readFileSync(join(__dirname, "layout.tsx"), "utf8");
    expect(layout).toContain('href="#isi"');
    expect(layout).toMatch(/<main id="isi" tabIndex=\{-1\}/);
  });
});
