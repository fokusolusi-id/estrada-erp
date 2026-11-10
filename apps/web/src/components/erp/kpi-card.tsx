import { formatAmount, type Money, type Unit } from "@estrada/domain";
import { ArrowUpRight, Minus, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge-2";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Sparkline } from "./charts";

/** A row of KPI cells joined in one bordered strip. Put `KpiCard`s inside. */
export function KpiStrip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="@container w-full">
      <div className={cn("bg-background border-border grid grid-cols-1 overflow-hidden rounded-xl border @xl:grid-cols-2 @4xl:grid-cols-4", className)}>
        {children}
      </div>
    </div>
  );
}

/**
 * One headline number: title and note, the value with the change against last year as a pill, and a trend line.
 * The number stays neutral; red is for results to watch (`signal`). The pill is green for an increase and red for a decrease.
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
  change?: { pct: Money | null; goodWhenUp: boolean; against: number };
  trend?: number[];
  signal?: boolean;
}) {
  const pct = change?.pct;
  const tone = !pct || pct.isZero() ? null : pct.isPositive();
  const Icon = !pct || pct.isZero() ? Minus : pct.isNegative() ? TrendingDown : ArrowUpRight;
  return (
    <Card className="border-border gap-0 rounded-none border-0 border-b py-0 shadow-none last:border-b-0 @xl:border-r @xl:last:border-r-0">
      <CardContent className="flex h-full flex-col justify-between gap-6 p-5">
        <div className="space-y-0.5">
          <div className="text-foreground text-base font-semibold">{label}</div>
          <div className="text-muted-foreground min-h-5 text-sm">{note}</div>
        </div>
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("tabular text-2xl font-bold tracking-tight whitespace-nowrap", signal && value.isNegative() && "text-destructive")}>
              {formatAmount(value, unit)}
            </span>
            {pct ? (
              <Badge
                data-testid="kpi-change"
                appearance="light"
                variant={tone === null ? "secondary" : tone ? "success" : "destructive"}
                shape="circle"
                className="px-2 text-xs"
              >
                <Icon />
                {pct.isNegative() ? "-" : "+"}
                {pct.abs().toFixed(1).replace(".", ",")}%
              </Badge>
            ) : null}
          </div>
          <div className="flex items-end gap-2 text-sm">
            {trend && trend.length > 1 ? <Sparkline values={trend} /> : null}
            <span className="text-muted-foreground">{change ? `vs ${change.against}` : null}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
