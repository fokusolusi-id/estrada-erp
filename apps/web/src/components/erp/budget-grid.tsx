import { lineTotal, summarize, type ApprovalState, type BudgetLine, type Unit } from "@estrada/domain";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyCell } from "./money-cell";
import { StatusBadge } from "./status-badge";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"] as const;

export interface GridLine extends BudgetLine {
  coaName: string;
  state: ApprovalState;
}

/**
 * 12-month budget grid. Totals always come from the domain (never typed by hand).
 * Read-only in the base app; editing, paste-from-Excel and fill-right come in phase 1.
 */
export function BudgetGrid({ lines, unit = "juta" }: { lines: GridLine[]; unit?: Unit }) {
  const total = summarize(lines, () => "all").get("all");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="sticky left-0 bg-background">COA</TableHead>
          <TableHead>Entitas</TableHead>
          <TableHead>Status</TableHead>
          {MONTHS.map((m) => (
            <TableHead key={m} className="text-right">
              {m}
            </TableHead>
          ))}
          <TableHead className="text-right">Total RKA</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((l) => (
          <TableRow key={l.id}>
            <TableCell className="sticky left-0 bg-background">
              <div className="font-medium">{l.coaCode}</div>
              <div className="text-muted-foreground text-xs">{l.coaName}</div>
            </TableCell>
            <TableCell>{l.entity}</TableCell>
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
          </TableRow>
        ))}
      </TableBody>
      {total ? (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>Total</TableCell>
            {total.months.map((m, i) => (
              <TableCell key={i} className="text-right">
                <MoneyCell value={m} unit={unit} />
              </TableCell>
            ))}
            <TableCell className="text-right" data-testid="grand-total">
              <MoneyCell value={total.total} unit={unit} />
            </TableCell>
          </TableRow>
        </TableFooter>
      ) : null}
    </Table>
  );
}
