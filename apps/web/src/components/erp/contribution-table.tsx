import { sum, unitLabel, type Contribution, type Unit } from "@estrada/domain";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FigureCell } from "./money-cell";

const pct = (part: Contribution["cost"], whole: Contribution["cost"]) =>
  whole.isZero() ? "—" : `${part.div(whole).times(100).toFixed(1).replace(".", ",")}%`;

/** Revenue, cost and net per group, with each group's share of total cost (Kontribusi Divisi). */
export function ContributionTable({ rows, unit = "juta", label }: { rows: Contribution[]; unit?: Unit; label: string }) {
  const revenue = sum(rows.map((r) => r.revenue));
  const cost = sum(rows.map((r) => r.cost));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">
            Pendapatan <span className="text-muted-foreground font-normal">({unitLabel(unit)})</span>
          </TableHead>
          <TableHead className="text-right">
            Total Biaya <span className="text-muted-foreground font-normal">({unitLabel(unit)})</span>
          </TableHead>
          <TableHead className="text-right">Porsi biaya</TableHead>
          <TableHead className="text-right">Selisih</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key} data-testid={`contribution-${r.key}`}>
            <TableCell className="font-medium">{r.key}</TableCell>
            <TableCell className="text-right">
              <FigureCell value={r.revenue} unit={unit} />
            </TableCell>
            <TableCell className="text-right" data-testid="cost">
              <FigureCell value={r.cost} unit={unit} />
            </TableCell>
            <TableCell className="text-right tabular" data-testid="share">
              {pct(r.cost, cost)}
            </TableCell>
            <TableCell className="text-right">
              <FigureCell value={r.net} unit={unit} signal />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right">
            <FigureCell value={revenue} unit={unit} />
          </TableCell>
          <TableCell className="text-right" data-testid="contribution-total-cost">
            <FigureCell value={cost} unit={unit} />
          </TableCell>
          <TableCell className="text-right">100%</TableCell>
          <TableCell className="text-right">
            <FigureCell value={revenue.minus(cost)} unit={unit} signal />
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
