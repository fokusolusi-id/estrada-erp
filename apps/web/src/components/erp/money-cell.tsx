import { formatIdr, type Money, type Unit } from "@estrada/domain";
import { cn } from "@/lib/utils";

export function MoneyCell({ value, unit = "rp", className }: { value: Money; unit?: Unit; className?: string }) {
  return (
    <span className={cn("tabular whitespace-nowrap", value.isNegative() && "text-destructive", className)}>
      {formatIdr(value, { unit, decimals: unit === "rp" ? 0 : 1 })}
    </span>
  );
}
