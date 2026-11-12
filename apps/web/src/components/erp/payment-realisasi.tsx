import { formatIdr, ZERO, sum, type Money } from "@estrada/domain";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface RealisasiRow {
  id: string;
  coaCode: string;
  coaName: string;
  item?: string | null;
  entity: string;
  ownerUnit: string;
  plan: Money;
  paid: Money;
  committed: Money;
}

const pct = (part: Money, whole: Money) => (whole.isZero() ? "–" : `${part.div(whole).times(100).toFixed(1).replace(".", ",")}%`);

/**
 * Serapan anggaran: each RKA line's plan beside what Paid requests have used (DPP) and what requests in flight hold.
 * Sisa goes red when the line is overspent.
 */
export function PaymentRealisasi({ rows, year }: { rows: RealisasiRow[]; year: number }) {
  const total = (k: "plan" | "paid" | "committed") => sum(rows.map((r) => r[k]));
  const left = (r: Pick<RealisasiRow, "plan" | "paid" | "committed">) => r.plan.minus(r.paid).minus(r.committed);
  const all = { plan: total("plan"), paid: total("paid"), committed: total("committed") };
  return (
    <Table data-testid="payment-realisasi">
      <TableHeader>
        <TableRow>
          <TableHead>COA</TableHead>
          <TableHead>Entitas</TableHead>
          <TableHead>Pemilik</TableHead>
          <TableHead className="text-right">RKA {year}</TableHead>
          <TableHead className="text-right">Realisasi</TableHead>
          <TableHead className="text-right">Sedang berjalan</TableHead>
          <TableHead className="text-right">Sisa</TableHead>
          <TableHead className="text-right">Serapan</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const rest = left(r);
          return (
            <TableRow key={r.id} data-testid={`realisasi-${r.id}`}>
              <TableCell className="max-w-80">
                <span className="font-mono text-xs">{r.coaCode}</span> {r.item || r.coaName}
              </TableCell>
              <TableCell>{r.entity}</TableCell>
              <TableCell>{r.ownerUnit}</TableCell>
              <TableCell className="tabular text-right">{formatIdr(r.plan)}</TableCell>
              <TableCell className="tabular text-right">{formatIdr(r.paid)}</TableCell>
              <TableCell className="tabular text-muted-foreground text-right">{r.committed.isZero() ? "–" : formatIdr(r.committed)}</TableCell>
              <TableCell className={cn("tabular text-right", rest.isNegative() && "text-destructive font-medium")}>{formatIdr(rest)}</TableCell>
              <TableCell className="tabular text-right">{pct(r.paid, r.plan)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3} className="font-semibold">
            Total
          </TableCell>
          <TableCell className="tabular text-right font-semibold">{formatIdr(all.plan)}</TableCell>
          <TableCell className="tabular text-right font-semibold" data-testid="realisasi-total">
            {formatIdr(all.paid)}
          </TableCell>
          <TableCell className="tabular text-right font-semibold">{all.committed.eq(ZERO) ? "–" : formatIdr(all.committed)}</TableCell>
          <TableCell className="tabular text-right font-semibold">{formatIdr(left(all))}</TableCell>
          <TableCell className="tabular text-right font-semibold">{pct(all.paid, all.plan)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
