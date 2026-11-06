import { formatAmount, type Money, type Unit } from "@estrada/domain";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Sparkline } from "./charts";

/**
 * One headline number: its label, the change against 2026 as a badge, a trend line for the year and a short note.
 * The number stays neutral; red is for results to watch (`signal`), the badge says whether the change is good news.
 */
export function KpiCard({
  label,
  value,
  unit = "juta",
  note,
  change,
  trend,
  signal = false,
}: {
  label: string;
  value: Money;
  unit?: Unit;
  note?: string;
  change?: { pct: Money | null; goodWhenUp: boolean };
  trend?: number[];
  signal?: boolean;
}) {
  const pct = change?.pct;
  const good = pct && !pct.isZero() ? pct.isPositive() === change!.goodWhenUp : null;
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription className="font-medium">{label}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1 px-4">
        <div className="flex items-end justify-between gap-2">
          <span className={cn("tabular text-xl font-semibold tracking-tight whitespace-nowrap", signal && value.isNegative() && "text-destructive")}>
            {formatAmount(value, unit)}
          </span>
          {trend && trend.length > 1 ? <Sparkline values={trend} /> : null}
        </div>
        {pct ? (
          <span
            data-testid="kpi-change"
            className={cn("text-xs font-medium", good === null ? "text-muted-foreground" : good ? "text-success" : "text-destructive")}
          >
            {pct.isNegative() ? "▼" : "▲"} {pct.abs().toFixed(1).replace(".", ",")}% vs 2026
          </span>
        ) : null}
        {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
      </CardContent>
    </Card>
  );
}
