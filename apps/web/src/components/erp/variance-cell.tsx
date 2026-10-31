import { formatIdr, variance, type Money, type Unit } from "@estrada/domain";
import { cn } from "@/lib/utils";

/** 2027 plan against a 2026 figure: the change in rupiah and percent. A swing of 20% or more is tinted for a closer look. */
export function VarianceCell({ plan, base, unit = "juta" }: { plan: Money; base: Money | null; unit?: Unit }) {
  if (!base) {
    return (
      <span data-testid="variance" className="text-muted-foreground text-xs">
        Baru
      </span>
    );
  }
  const v = variance(plan, base);
  const plus = v.amount.isPositive() && !v.amount.isZero() ? "+" : "";
  const pct = v.pct ? ` (${plus}${v.pct.toFixed(1).replace(".", ",")}%)` : "";
  const swing = !!v.pct && v.pct.abs().gte(20);
  return (
    <span data-testid="variance" data-swing={String(swing)} className={cn("tabular whitespace-nowrap text-xs", swing && "bg-warning/15 rounded px-1")}>
      {plus}
      {formatIdr(v.amount, { unit, decimals: unit === "rp" ? 0 : 1 })}
      {pct}
    </span>
  );
}
