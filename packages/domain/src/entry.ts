import Decimal from "decimal.js";
import { money, ZERO, type Money } from "./money";

const GROUPED = { ".": /^\d{1,3}(\.\d{3})+$/, ",": /^\d{1,3}(,\d{3})+$/ } as const;

function invalid(raw: string): never {
  throw new Error(`Invalid amount: "${raw}"`);
}

/** Integer part with `sep` as thousands separator, checked to be well grouped. */
function ungroup(int: string, sep: "." | ",", raw: string): string {
  if (!int.includes(sep)) return int;
  if (!GROUPED[sep].test(int)) invalid(raw);
  return int.split(sep).join("");
}

/**
 * Reads an amount as people type it or Excel pastes it: id-ID first (1.234.567,89),
 * en-US exports (1,234,567.89) when both separators make it unambiguous.
 * A single dot before exactly three digits is id-ID grouping; a single comma is the id-ID decimal.
 */
export function parseIdr(raw: string): Money {
  let s = raw.replace(/rp/i, "").replace(/[\s ]/g, "");
  if (s === "" || s === "-") return ZERO;

  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  } else if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) invalid(raw);

  const dots = s.split(".").length - 1;
  const commas = s.split(",").length - 1;
  let normalized: string;

  if (dots && commas) {
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const group = dec === "," ? "." : ",";
    const [int = "", frac, extra] = s.split(dec);
    if (extra !== undefined || !frac) invalid(raw);
    normalized = `${ungroup(int, group, raw)}.${frac}`;
  } else if (commas) {
    if (commas > 1) normalized = ungroup(s, ",", raw);
    else normalized = s.replace(",", ".");
  } else if (dots) {
    const isGrouping = dots > 1 || /^\d{1,3}\.\d{3}$/.test(s);
    normalized = isGrouping ? ungroup(s, ".", raw) : s;
  } else {
    normalized = s;
  }

  const value = money(normalized);
  return negative ? value.negated() : value;
}

/** A block copied from Excel: rows split on newlines, cells on tabs. */
export function parsePaste(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n$/, "")
    .split("\n")
    .map((row) => row.split("\t"));
}

/** Writes pasted cells from month `start` (1–12); cells past December are dropped. */
export function pasteMonths(months: readonly Money[], start: number, cells: readonly string[]): Money[] {
  const out = [...months];
  cells.forEach((c, i) => {
    const idx = start - 1 + i;
    if (idx < 12) out[idx] = parseIdr(c);
  });
  return out;
}

/** Copies month `from` (1–12) across the rest of the year, for flat monthly amounts. */
export function fillRight(months: readonly Money[], from: number): Money[] {
  const value = months[from - 1] ?? ZERO;
  return months.map((m, i) => (i >= from - 1 ? value : m));
}

/** Splits a yearly total evenly over Jan–Des to the sen; December takes the leftover so the months add up exactly. */
export function spreadEvenly(total: Money): Money[] {
  const month = total.div(12).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  return Array.from({ length: 12 }, (_, i) => (i < 11 ? month : total.minus(month.times(11))));
}
