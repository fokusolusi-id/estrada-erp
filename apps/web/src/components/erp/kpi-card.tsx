import { formatAmount, type Money, type Unit } from "@estrada/domain";
import { ArrowUpRight, Minus, TrendingDown } from "lucide-react";
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
 * One headline number, read like a ledger line: the label, the figure, then the change against last year as a coloured
 * figure with an arrow (no pill), and the trend as a line along the foot of the cell.
 * The figure stays neutral; red is for results to watch (`signal`). The change is green for an increase and red for a decrease,
 * and always carries an arrow and a sign, so colour is never the only cue.
 */
export function KpiCard({
  label,
  value,
  unit = "juta",
  note,
  change,
  trend,
  signal = false,
  missing,
}: {
  label: string;
  value: Money;
  unit?: Unit;
  note?: string | undefined;
  change?: { pct: Money | null; goodWhenUp: boolean; against: number };
  trend?: number[];
  signal?: boolean;
  /** Why there is nothing to show. Replaces the figure, so an unrecorded zero is not read as a result. */
  missing?: string | undefined;
}) {
  const pct = change?.pct;
  const tone = !pct || pct.isZero() ? null : pct.isPositive();
  const Icon = !pct || pct.isZero() ? Minus : pct.isNegative() ? TrendingDown : ArrowUpRight;
  const changeColour = tone === null ? "text-muted-foreground" : tone ? "text-success" : "text-destructive";
  const lineTone = tone === null ? "var(--muted-foreground)" : tone ? "var(--success)" : "var(--destructive)";
  return (
    <Card className="border-border gap-0 rounded-none border-0 border-b py-0 shadow-none last:border-b-0 @xl:border-r @xl:last:border-r-0">
      <CardContent className="flex h-full flex-col gap-3 px-5 pt-4 pb-0 max-sm:gap-1 max-sm:pt-3">
        <div className="grid gap-0.5">
          <div className="text-muted-foreground text-sm font-medium">{label}</div>
          <div className="text-muted-foreground min-h-4 text-xs max-sm:min-h-0">{note}</div>
        </div>
        {missing ? (
          <div className="grid gap-1 pb-4 max-sm:pb-3">
            <span className="text-section text-muted-foreground">Belum ada data</span>
            <span className="text-muted-foreground text-xs">{missing}</span>
          </div>
        ) : (
          <>
            <div className="grid gap-1">
              <span className={cn("tabular text-figure whitespace-nowrap", signal && value.isNegative() && "text-destructive")}>
                {formatAmount(value, unit)}
              </span>
              <div className="flex min-h-5 flex-wrap items-baseline gap-x-2 text-sm max-sm:min-h-0">
                {pct ? (
                  <span data-testid="kpi-change" className={cn("tabular inline-flex items-center gap-1 font-medium", changeColour)}>
                    <Icon aria-hidden className="size-3.5 self-center" />
                    {pct.isNegative() ? "-" : "+"}
                    {pct.abs().toFixed(1).replace(".", ",")}%
                  </span>
                ) : null}
                {change ? <span className="text-muted-foreground text-xs">vs {change.against}</span> : null}
              </div>
            </div>
            {trend && trend.length > 1 ? (
              <div data-trend className="-mx-5 mt-auto max-sm:hidden">
                <Sparkline values={trend} tone={lineTone} className="h-12 w-full" />
              </div>
            ) : null}
            <div className={trend && trend.length > 1 ? "hidden max-sm:block max-sm:pb-3" : "pb-4 max-sm:pb-3"} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
