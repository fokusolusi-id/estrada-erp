import type { Money, Unit } from "@estrada/domain";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MONTHS } from "./budget-grid";
import { MoneyCell } from "./money-cell";

export interface CashRow {
  key: string;
  label: string;
  months: readonly Money[];
  /** Year total; leave out for balances, where a total means nothing. */
  total?: Money;
  /** A computed subtotal, styled like the workbook's formula rows. */
  derived?: boolean;
  /** Starts a new block. */
  section?: string;
}

/** Arus Kas by month, laid out like Forecast CF Bulanan: cash in and out, the balance, and the funding gap. */
export function CashTable({ rows, unit = "juta" }: { rows: CashRow[]; unit?: Unit }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="bg-background sticky left-0 min-w-52">Uraian</TableHead>
          {MONTHS.map((m) => (
            <TableHead key={m} className="text-right">
              {m}
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.flatMap((r) => [
          ...(r.section
            ? [
                <TableRow key={`${r.key}-section`} className="hover:bg-transparent">
                  <TableCell colSpan={14} className="text-muted-foreground bg-background sticky left-0 pt-4 text-xs font-medium uppercase">
                    {r.section}
                  </TableCell>
                </TableRow>,
              ]
            : []),
          <TableRow key={r.key} data-testid={`cash-${r.key}`} className={cn(r.derived && "bg-accent/50 font-medium")}>
            <TableCell className={cn("sticky left-0", r.derived ? "bg-accent" : "bg-background")}>{r.label}</TableCell>
            {r.months.map((m, i) => (
              <TableCell key={i} className="text-right" data-testid={`m${i + 1}`}>
                <MoneyCell value={m} unit={unit} />
              </TableCell>
            ))}
            <TableCell className="text-right font-medium" data-testid="total">
              {r.total ? <MoneyCell value={r.total} unit={unit} /> : null}
            </TableCell>
          </TableRow>,
        ])}
      </TableBody>
    </Table>
  );
}
