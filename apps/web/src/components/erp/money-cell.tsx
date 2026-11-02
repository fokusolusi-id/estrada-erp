import { formatAmount, type Money, type Unit } from "@estrada/domain";
import { cn } from "@/lib/utils";

export function MoneyCell({ value, unit = "rp", className }: { value: Money; unit?: Unit; className?: string }) {
  return (
    <span className={cn("tabular whitespace-nowrap", value.isNegative() && "text-destructive", className)}>
      {formatAmount(value, unit)}
    </span>
  );
}
