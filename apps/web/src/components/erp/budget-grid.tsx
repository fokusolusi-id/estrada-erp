import Link from "next/link";
import type { HiddenColumns } from "@estrada/domain";
import { TOTAL_KIND_LABEL, lineTotal, totalsByKind, unitLabel, type ApprovalState, type BudgetLine, type Category, type Money, type Unit } from "@estrada/domain";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FigureCell } from "./money-cell";
import { StatusBadge } from "./status-badge";
import { VarianceCell } from "./variance-cell";

/** The fixed first column: on a phone it leaves room for one figure beside it. */
const FIRST = "sticky left-0 z-10 w-44 min-w-44 max-w-44 bg-card whitespace-normal shadow-[inset_-1px_0_0_var(--border)] sm:w-80 sm:min-w-80 sm:max-w-80";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;

export interface GridLine extends BudgetLine {
  coaName: string;
  category: Category;
  /** What the line buys or earns; tells apart lines on the same COA. */
  item?: string | null;
  state: ApprovalState;
  priorRka?: Money | null;
  priorActual?: Money | null;
  /** Notes for reviewers, e.g. the workbook's cleaning flags. */
  flags?: string[];
  /** Comments on the line; the link to its discussion shows the count. */
  commentCount?: number;
}

/** Link to a line's page with its discussion and history. */
export function DiscussionLink({ id, count = 0, about }: { id: string; count?: number | undefined; about: string }) {
  return (
    <Link aria-label={`Diskusi ${about}${count ? ` (${count})` : ""}`} href={`/rka/line/${id}`} className="text-primary mr-1 inline-flex min-h-6 shrink-0 items-center text-xs underline-offset-2 hover:underline">
      Diskusi{count ? ` (${count})` : ""}
    </Link>
  );
}

/**
 * 12-month budget grid. Totals always come from the domain (never typed by hand).
 * Read-only; drafts are edited in BudgetEditor. Last year's actual and the change sit beside each line, as in the division sheets.
 */
export function BudgetGrid({
  lines,
  priorYear,
  unit = "juta",
  discussion = true,
  hide = {},
  totalOf,
}: {
  lines: GridLine[];
  priorYear: number;
  unit?: Unit;
  discussion?: boolean;
  /** Columns the header has narrowed to one value. */
  hide?: Partial<HiddenColumns>;
  /** The lines the Total row adds up, when `lines` is only one page of them. */
  totalOf?: GridLine[];
}) {
  const totals = totalsByKind(totalOf ?? lines);
  return (
    <Table containerClassName="max-h-[80vh] overflow-auto rounded-md border">
      <TableHeader className="bg-card sticky top-0 z-20 shadow-[inset_0_-1px_0_var(--border)]">
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(FIRST, "z-30")}>
            COA <span className="text-muted-foreground font-normal">({unitLabel(unit)})</span>
          </TableHead>
          {hide.entity ? null : <TableHead>Entitas</TableHead>}
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Total RKA</TableHead>
          <TableHead className="text-right">Actual {priorYear}</TableHead>
          <TableHead className="text-right">Perubahan</TableHead>
          {MONTHS.map((m) => (
            <TableHead key={m} className="text-right">
              {m}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((l) => (
          <TableRow key={l.id}>
            <TableCell className={cn(FIRST, "py-1.5")}>
              {discussion ? (
                <Link href={`/rka/line/${l.id}`} title={l.item || l.coaName} className="line-clamp-2 font-medium underline-offset-2 hover:underline">
                  {l.coaCode} · {l.item || l.coaName}
                </Link>
              ) : (
                <div className="line-clamp-2 font-medium" title={l.item || l.coaName}>
                  {l.coaCode} · {l.item || l.coaName}
                </div>
              )}
              {/* A phone has no room for these columns beside the title, so they are repeated under it. */}
              <div data-testid={`phone-${l.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 sm:hidden">
                <FigureCell value={lineTotal(l)} unit={unit} className="font-medium" />
                <StatusBadge state={l.state} />
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                <span data-testid={`unit-${l.id}`} className="shrink-0 font-medium">
                  {l.requestorUnit === l.ownerUnit ? l.ownerUnit : `${l.ownerUnit} · diminta ${l.requestorUnit}`}
                </span>
                {discussion ? <DiscussionLink id={l.id} count={l.commentCount} about={`${l.coaCode} · ${l.item || l.coaName}`} /> : null}
                {l.flags?.length ? (
                  <span title={l.flags.join("; ")} className="bg-warning/15 text-foreground rounded px-1 font-medium">
                    Perlu review
                  </span>
                ) : null}
                {l.item ? (
                  <span className="truncate" title={l.coaName}>
                    {l.coaName}
                  </span>
                ) : null}
              </div>
            </TableCell>
            {hide.entity ? null : <TableCell>{l.entity}</TableCell>}
            <TableCell>
              <StatusBadge state={l.state} />
            </TableCell>
            <TableCell className="bg-accent/50 text-right font-medium" data-testid={`total-${l.id}`}>
              <FigureCell value={lineTotal(l)} unit={unit} />
            </TableCell>
            <TableCell className="text-right" data-testid={`actual-${l.id}`}>
              {l.priorActual ? <FigureCell value={l.priorActual} unit={unit} /> : "—"}
            </TableCell>
            <TableCell className="text-right">
              <VarianceCell plan={lineTotal(l)} base={l.priorActual ?? null} unit={unit} />
            </TableCell>
            {l.months.map((m, i) => (
              <TableCell key={i} className="text-right">
                <FigureCell value={m} unit={unit} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      {totals.length ? (
        <TableFooter className="bg-muted shadow-[inset_0_1px_0_var(--border)] sm:sticky sm:bottom-0 sm:z-20">
          {totals.map((t) => (
            <TableRow key={t.kind} className="hover:bg-transparent [&_td]:py-1">
              <TableCell className={cn(FIRST, "bg-muted z-30")}>Total {TOTAL_KIND_LABEL[t.kind]}</TableCell>
              <TableCell colSpan={hide.entity ? 1 : 2} />
              <TableCell className="text-right" data-testid={`grand-total-${t.kind}`}>
                <FigureCell value={t.total} unit={unit} />
              </TableCell>
              <TableCell colSpan={2} />
              {t.months.map((m, i) => (
                <TableCell key={i} className="text-right">
                  <FigureCell value={m} unit={unit} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableFooter>
      ) : null}
    </Table>
  );
}
