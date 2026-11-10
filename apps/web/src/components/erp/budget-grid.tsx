import Link from "next/link";
import type { HiddenColumns } from "@estrada/domain";
import { lineTotal, summarize, type ApprovalState, type BudgetLine, type Money, type Unit } from "@estrada/domain";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyCell } from "./money-cell";
import { StatusBadge } from "./status-badge";
import { VarianceCell } from "./variance-cell";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;

export interface GridLine extends BudgetLine {
  coaName: string;
  state: ApprovalState;
  priorRka?: Money | null;
  priorActual?: Money | null;
  /** Notes for reviewers, e.g. the workbook's cleaning flags. */
  flags?: string[];
  /** Comments on the line; the link to its discussion shows the count. */
  commentCount?: number;
}

/**
 * 12-month budget grid. Totals always come from the domain (never typed by hand).
 * Read-only; drafts are edited in BudgetEditor. Last year's actual and the change sit beside each line, as in the division sheets.
 */
/** Link to a line's page with its discussion and history. */
export function DiscussionLink({ id, count = 0 }: { id: string; count?: number | undefined }) {
  return (
    <Link href={`/rka/line/${id}`} className="text-primary mr-1 text-xs underline-offset-2 hover:underline">
      Diskusi{count ? ` (${count})` : ""}
    </Link>
  );
}

export function BudgetGrid({
  lines,
  priorYear,
  unit = "juta",
  discussion = true,
  hide = {},
}: {
  lines: GridLine[];
  priorYear: number;
  unit?: Unit;
  discussion?: boolean;
  /** Columns the header has narrowed to one value. */
  hide?: Partial<HiddenColumns>;
}) {
  const total = summarize(lines, () => "all").get("all");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="sticky left-0 bg-background">COA</TableHead>
          {hide.entity ? null : <TableHead>Entitas</TableHead>}
          <TableHead>Status</TableHead>
          {MONTHS.map((m) => (
            <TableHead key={m} className="text-right">
              {m}
            </TableHead>
          ))}
          <TableHead className="text-right">Total RKA</TableHead>
          <TableHead className="text-right">Actual {priorYear}</TableHead>
          <TableHead className="text-right">Perubahan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((l) => (
          <TableRow key={l.id}>
            <TableCell className="sticky left-0 bg-background">
              <div className="font-medium">{l.coaCode}</div>
              <div className="text-muted-foreground text-xs">{l.coaName}</div>
              {discussion ? <DiscussionLink id={l.id} count={l.commentCount} /> : null}
              {l.flags?.length ? (
                <span title={l.flags.join("; ")} className="bg-warning/15 rounded px-1 text-[10px] font-medium">
                  Perlu review
                </span>
              ) : null}
            </TableCell>
            {hide.entity ? null : <TableCell>{l.entity}</TableCell>}
            <TableCell>
              <StatusBadge state={l.state} />
            </TableCell>
            {l.months.map((m, i) => (
              <TableCell key={i} className="text-right">
                <MoneyCell value={m} unit={unit} />
              </TableCell>
            ))}
            <TableCell className="bg-accent/50 text-right font-medium" data-testid={`total-${l.id}`}>
              <MoneyCell value={lineTotal(l)} unit={unit} />
            </TableCell>
            <TableCell className="text-right" data-testid={`actual-${l.id}`}>
              {l.priorActual ? <MoneyCell value={l.priorActual} unit={unit} /> : "—"}
            </TableCell>
            <TableCell className="text-right">
              <VarianceCell plan={lineTotal(l)} base={l.priorActual ?? null} unit={unit} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      {total ? (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={hide.entity ? 2 : 3}>Total</TableCell>
            {total.months.map((m, i) => (
              <TableCell key={i} className="text-right">
                <MoneyCell value={m} unit={unit} />
              </TableCell>
            ))}
            <TableCell className="text-right" data-testid="grand-total">
              <MoneyCell value={total.total} unit={unit} />
            </TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableFooter>
      ) : null}
    </Table>
  );
}
