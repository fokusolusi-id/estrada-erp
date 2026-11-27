import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** WCAG AA for the colours used as text, read from the stylesheet itself so a token change cannot slip past. */
const css = readFileSync(join(__dirname, "globals.css"), "utf8");

function tokens(selector: ":root" | ".dark") {
  const start = css.indexOf(`\n${selector} {`);
  const block = css.slice(start, css.indexOf("\n}", start));
  return new Map([...block.matchAll(/--([a-z-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g)].map((m) => [m[1]!, [Number(m[2]), Number(m[3]), Number(m[4])] as const]));
}

/** WCAG relative luminance of an oklch colour, clipped to sRGB. */
function luminance([L, C, H]: readonly [number, number, number]) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  return (
    0.2126 * clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) +
    0.7152 * clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) +
    0.0722 * clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  );
}

describe.each([":root", ".dark"] as const)("text contrast in %s", (theme) => {
  const t = tokens(theme);
  const text = ["foreground", "muted-foreground", "primary", "destructive", "success", "state-finance-text"];
  it.each(text.flatMap((fg) => ["background", "card", "muted"].map((bg) => [fg, bg] as const)))("%s on %s reaches 4.5:1", (fg, bg) => {
    const [hi, lo] = [luminance(t.get(fg)!), luminance(t.get(bg)!)].sort((x, y) => y - x);
    expect((hi! + 0.05) / (lo! + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
