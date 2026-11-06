import { formatAmount, formatFigure, type Money, type Unit } from "@estrada/domain";
import { cn } from "@/lib/utils";

export function MoneyCell({ value, unit = "rp", className }: { value: Money; unit?: Unit; className?: string }) {
  return (
    <span className={cn("tabular whitespace-nowrap", value.isNegative() && "text-destructive", className)}>
      {formatAmount(value, unit)}
    </span>
  );
}

/**
 * A report cell: the number alone (the unit sits in the column header), negatives in brackets, a dash for zero.
 * Red is kept for results that matter (`signal`), so a page of costs does not turn red.
 */
export function FigureCell({ value, unit, signal = false, className }: { value: Money; unit: Unit; signal?: boolean; className?: string }) {
  const text = formatFigure(value, unit);
  return (
    <span className={cn("tabular whitespace-nowrap", text === "–" && "text-muted-foreground", signal && value.isNegative() && text !== "–" && "text-destructive", className)}>
      {text}
    </span>
  );
}
