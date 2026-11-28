import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("RKA line search", () => {
  it("takes a row of its own on a phone, so the stage select cannot squeeze it", () => {
    const page = readFileSync(join(__dirname, "page.tsx"), "utf8");
    const field = page.slice(0, page.indexOf('htmlFor="rka-q"')).split("<div").at(-1)!;
    expect(field).toContain("basis-full");
    expect(field).toContain("sm:basis-0");
  });
});
