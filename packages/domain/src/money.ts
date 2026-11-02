import Decimal from "decimal.js";

/** Money is always a Decimal. Never use JS numbers for rupiah. */
export type Money = Decimal;

const NUMERIC = /^-?\d+(\.\d+)?$/;

export function money(value: string | number | Decimal): Money {
  if (value instanceof Decimal) return value;
  const s = typeof value === "number" ? value.toString() : value.trim();
  if (!NUMERIC.test(s)) throw new Error(`Invalid money value: "${value}"`);
  return new Decimal(s);
}

export const ZERO: Money = new Decimal(0);

export function sum(values: readonly Money[]): Money {
  return values.reduce<Money>((acc, v) => acc.plus(v), ZERO);
}

export type Unit = "rp" | "juta" | "miliar";
const DIVISOR: Record<Unit, Decimal> = {
  rp: new Decimal(1),
  juta: new Decimal(1_000_000),
  miliar: new Decimal(1_000_000_000),
};

export function scaleTo(value: Money, unit: Unit): Money {
  return value.div(DIVISOR[unit]);
}

export function formatIdr(value: Money, opts: { decimals?: number; unit?: Unit } = {}): string {
  const unit = opts.unit ?? "rp";
  const decimals = opts.decimals ?? (value.isInteger() && unit === "rp" ? 0 : 2);
  const scaled = scaleTo(value, unit).toFixed(decimals);
  const [int, frac] = scaled.replace("-", "").split(".");
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = value.isNegative() ? "-" : "";
  const suffix = unit === "rp" ? "" : unit === "juta" ? " jt" : " M";
  return `${sign}Rp ${grouped}${frac ? `,${frac}` : ""}${suffix}`;
}

/** The units a viewer may pick for screens (client: angka penuh, juta or miliar). Juta is the workbook's own. */
export const UNITS: readonly { value: Unit; label: string }[] = [
  { value: "rp", label: "Angka penuh" },
  { value: "juta", label: "Juta" },
  { value: "miliar", label: "Miliar" },
];
const UNIT_DECIMALS: Record<Unit, number> = { rp: 0, juta: 1, miliar: 2 };

export function parseUnit(value: string | undefined | null): Unit {
  return UNITS.some((u) => u.value === value) ? (value as Unit) : "juta";
}

/** An amount on screen in the viewer's unit, rounded for reading; stored values keep their cents. */
export function formatAmount(value: Money, unit: Unit): string {
  return formatIdr(value, { unit, decimals: UNIT_DECIMALS[unit] });
}
