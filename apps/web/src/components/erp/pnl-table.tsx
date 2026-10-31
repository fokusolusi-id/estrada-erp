import type { PnlKey, PnlRow, Unit } from "@estrada/domain";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MONTHS } from "./budget-grid";
import { MoneyCell } from "./money-cell";

export const PNL_LABEL: Record<PnlKey, string> = {
  Revenue: "Pendapatan",
  COGS: "COGS",
  GrossProfit: "Laba Kotor",
  OPEX: "OPEX",
  OperatingProfit: "Laba Operasional",
  OTHERS: "OTHERS",
  ProfitBeforeTax: "Laba Sebelum Pajak",
  CAPEX: "CAPEX",
  TotalCost: "Total Biaya",
};

/** Management Summary by month. Computed rows are styled like the workbook's formula cells and never editable. */
export function PnlTable({ rows, unit = "juta" }: { rows: PnlRow[]; unit?: Unit }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="bg-background sticky left-0 min-w-40">Uraian</TableHead>
          {MONTHS.map((m) => (
            <TableHead key={m} className="text-right">
              {m}
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow
            key={r.key}
            data-testid={`pnl-${r.key}`}
            data-derived={String(r.derived)}
            className={cn(r.derived && "bg-accent/50 font-medium", r.key === "TotalCost" && "border-t-2")}
          >
            <TableCell className={cn("sticky left-0", r.derived ? "bg-accent" : "bg-background")}>{PNL_LABEL[r.key]}</TableCell>
            {r.months.map((m, i) => (
              <TableCell key={i} className="text-right">
                <MoneyCell value={m} unit={unit} />
              </TableCell>
            ))}
            <TableCell className="text-right font-medium" data-testid="total">
              <MoneyCell value={r.total} unit={unit} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
