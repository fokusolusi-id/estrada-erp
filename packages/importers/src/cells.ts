import { money, type Money } from "@estrada/domain";

/** A cell value as the importer sees it, after formulas are resolved to their cached result. */
export type Cell = string | number | boolean | Date | null | undefined;

export function text(c: Cell): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c).trim();
}

/**
 * An amount to the cent. Excel stores doubles, so 0.1 + 0.2 arrives as 0.30000000000000004;
 * rounding to two decimals is what Finance sees in the sheet. Blank → null.
 */
export function amount(c: Cell): Money | null {
  if (c === null || c === undefined || c === "") return null;
  if (typeof c === "number") return money(c.toFixed(6)).toDecimalPlaces(2);
  const s = text(c).replace(/\s/g, "");
  if (!s || s === "-") return null;
  return money(s).toDecimalPlaces(2);
}

/** Finds the header row by its first required column and maps every header to its index. */
export function header(rows: Cell[][], required: readonly string[]): { row: number; col: (name: string) => number } {
  const row = rows.findIndex((r) => r.some((c) => text(c) === required[0]));
  if (row < 0) throw new Error(`Header "${required[0]}" not found`);
  const names = rows[row]!.map(text);
  for (const name of required) {
    if (!names.includes(name)) throw new Error(`Column "${name}" not found in the header row`);
  }
  return {
    row,
    col: (name) => {
      const i = names.indexOf(name);
      if (i < 0) throw new Error(`Column "${name}" not found in the header row`);
      return i;
    },
  };
}
