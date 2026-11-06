import { sum, unitLabel, type EntityAllocationRow, type Money, type Unit } from "@estrada/domain";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FigureCell } from "./money-cell";

/** Per entitas after shared costs are split: own cost, the shared cost moved to or from the entity, and the result. */
export function EntityAllocationTable({ rows, unit = "juta" }: { rows: EntityAllocationRow[]; unit?: Unit }) {
  const total = (pick: (r: EntityAllocationRow) => Money) => sum(rows.map(pick));
  const cells = (r: Pick<EntityAllocationRow, "revenue" | "costBefore" | "allocated" | "costAfter" | "netAfter">) =>
    (["revenue", "costBefore", "allocated", "costAfter", "netAfter"] as const).map((k) => (
      <TableCell key={k} className="text-right" data-testid={k}>
        <FigureCell value={r[k]} unit={unit} signal={k === "netAfter"} />
      </TableCell>
    ));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            Entitas <span className="text-muted-foreground font-normal">({unitLabel(unit)})</span>
          </TableHead>
          <TableHead className="text-right">Pendapatan</TableHead>
          <TableHead className="text-right">Biaya sendiri</TableHead>
          <TableHead className="text-right">Alokasi biaya bersama</TableHead>
          <TableHead className="text-right">Total Biaya</TableHead>
          <TableHead className="text-right">Selisih</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key} data-testid={`allocation-${r.key}`}>
            <TableCell className="font-medium">{r.key}</TableCell>
            {cells(r)}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          {cells({
            revenue: total((r) => r.revenue),
            costBefore: total((r) => r.costBefore),
            allocated: total((r) => r.allocated),
            costAfter: total((r) => r.costAfter),
            netAfter: total((r) => r.netAfter),
          })}
        </TableRow>
      </TableFooter>
    </Table>
  );
}
