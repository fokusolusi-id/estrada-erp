import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it.each(["text-figure", "text-page", "text-section"])("keeps the %s size when a text colour is added", (size) => {
    expect(cn(size, "text-destructive").split(" ")).toEqual([size, "text-destructive"]);
  });

  it("still lets a later size replace an earlier one", () => {
    expect(cn("text-sm", "text-figure")).toBe("text-figure");
  });
});
