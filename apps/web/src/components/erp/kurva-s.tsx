import type { CurvePoint } from "@estrada/domain";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const label = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const pct = (n: number | null) => (n === null ? "–" : `${String(n).replace(".", ",")}%`);

function Bar({ value, tone }: { value: number | null; tone: string }) {
  return (
    <div className="bg-muted h-2 w-full min-w-24 overflow-hidden rounded-full" aria-hidden>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, value ?? 0)}%` }} />
    </div>
  );
}

/** Kurva S: cumulative finished sites, planned against actual, month by month. */
export function KurvaS({ points }: { points: CurvePoint[] }) {
  if (!points.length) return <p className="text-muted-foreground text-sm">Kurva S terbentuk setelah lokasi terdaftar dengan tanggal rencana selesai.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Bulan</TableHead>
          <TableHead className="w-1/3">Rencana kumulatif</TableHead>
          <TableHead className="w-1/3">Aktual kumulatif</TableHead>
          <TableHead className="text-right">Selisih</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {points.map((p) => {
          const gap = p.actual === null ? null : Math.round((p.actual - p.planned) * 10) / 10;
          return (
            <TableRow key={p.month} data-testid={`curve-${p.month}`}>
              <TableCell>{label(p.month)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Bar value={p.planned} tone="bg-primary/40" />
                  <span className="tabular w-14 text-right text-sm" data-testid="planned">
                    {pct(p.planned)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Bar value={p.actual} tone="bg-primary" />
                  <span className="tabular w-14 text-right text-sm" data-testid="actual">
                    {pct(p.actual)}
                  </span>
                </div>
              </TableCell>
              <TableCell className={gap !== null && gap < 0 ? "text-destructive tabular text-right font-medium" : "tabular text-right"} data-testid="gap">
                {gap === null ? "–" : `${gap > 0 ? "+" : ""}${String(gap).replace(".", ",")}`}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
