import { unitLabel, type Money, type Unit } from "@estrada/domain";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MONTHS } from "./budget-grid";
import { FigureCell } from "./money-cell";

export interface ReportRow {
  key: string;
  label: string;
  months: readonly Money[];
  /** Year total; leave out for balances, where a total means nothing. */
  total?: Money;
  /** A computed subtotal or result: a full-row band, bold, a rule above. */
  derived?: boolean;
  /** Starts a new block with this heading. */
  section?: string;
  /** Shows negatives in red: results that matter, not every cost. */
  signal?: boolean;
}

const STICKY_LEFT = "sticky left-0 z-10 bg-card";
/** The total sits beside the label, so it is on screen before any month. */
const TOTAL = "shadow-[inset_-1px_0_0_var(--border)]";
/** Fixed cells must stay opaque on hover, or the months scrolling beneath them show through. */
const STICKY_HOVER = "group-hover:bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]";

/**
 * A month-by-month report (Management Summary, Arus Kas): the unit named once in the header, the label column
 * fixed while the months scroll beside the total, the header fixed while the rows scroll.
 */
export function ReportTable({ rows, unit, testIdPrefix }: { rows: ReportRow[]; unit: Unit; testIdPrefix: string }) {
  return (
    <Table containerClassName="max-h-[70vh] overflow-auto rounded-md border" className="[&_td]:py-1.5">
      <TableHeader className="bg-card sticky top-0 z-20 shadow-[inset_0_-1px_0_var(--border)]">
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(STICKY_LEFT, "z-30 min-w-32 sm:min-w-56")}>
            Uraian <span className="text-muted-foreground font-normal">({unitLabel(unit)})</span>
          </TableHead>
          <TableHead className={cn(TOTAL, "min-w-28 text-right")}>Total</TableHead>
          {MONTHS.map((m) => (
            <TableHead key={m} className="text-muted-foreground min-w-24 text-right font-medium">
              {m}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.flatMap((r) => [
          ...(r.section
            ? [
                <TableRow key={`${r.key}-section`} className="hover:bg-transparent">
                  <TableCell colSpan={14} className="text-muted-foreground pt-4 text-xs font-semibold tracking-wide uppercase">
                    {r.section}
                  </TableCell>
                </TableRow>,
              ]
            : []),
          <TableRow
            key={r.key}
            data-testid={`${testIdPrefix}-${r.key}`}
            data-derived={String(!!r.derived)}
            className={cn("group", r.derived && "bg-muted/60 hover:bg-muted border-t-foreground/15 border-t font-semibold")}
          >
            <TableCell className={cn(STICKY_LEFT, "whitespace-normal sm:whitespace-nowrap", r.derived ? "bg-muted group-hover:bg-muted" : STICKY_HOVER)}>{r.label}</TableCell>
            <TableCell className={cn(TOTAL, "text-right font-semibold")} data-testid="total">
              {r.total ? <FigureCell value={r.total} unit={unit} signal={r.signal} /> : null}
            </TableCell>
            {r.months.map((m, i) => (
              <TableCell key={i} className="text-right" data-testid={`m${i + 1}`}>
                <FigureCell value={m} unit={unit} signal={r.signal} />
              </TableCell>
            ))}
          </TableRow>,
        ])}
      </TableBody>
    </Table>
  );
}
