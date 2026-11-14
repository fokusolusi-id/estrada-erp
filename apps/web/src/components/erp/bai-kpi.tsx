import { BAI_TARGETS, type BaiKpiRow, type BaiStep } from "@estrada/domain";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STEPS: { step: BaiStep; holder: string; what: string }[] = [
  { step: "collect", holder: "Delivery Control", what: "Mencatat BAI sejak tanggal BAI" },
  { step: "compile", holder: "Project Admin", what: "Mengompilasi sejak BAI dicatat" },
  { step: "verify", holder: "Assurance (BCD)", what: "Memverifikasi sejak BAI dikompilasi" },
];

const pct = (n: number | null) => (n === null ? "–" : `${String(n).replace(".", ",")}%`);
const days = (n: number | null) => (n === null ? "–" : `${String(n).replace(".", ",")} hari`);

/**
 * Timeliness of the three BAI steps against their targets, per holder. Steps still open past the target count as late;
 * steps still inside it are left out of the percentage.
 */
export function BaiKpi({ kpi }: { kpi: Record<BaiStep, BaiKpiRow> }) {
  if (STEPS.every((s) => kpi[s.step].total === 0)) return <p className="text-muted-foreground text-sm">Belum ada BAI yang dicatat.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Langkah</TableHead>
          <TableHead>Pemegang</TableHead>
          <TableHead className="text-right">Target</TableHead>
          <TableHead className="text-right">Lokasi</TableHead>
          <TableHead className="text-right">Tepat waktu</TableHead>
          <TableHead className="text-right">Terlambat</TableHead>
          <TableHead className="text-right">Masih berjalan</TableHead>
          <TableHead className="text-right">Ketepatan</TableHead>
          <TableHead className="text-right">Rata-rata</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {STEPS.map(({ step, holder, what }) => {
          const k = kpi[step];
          return (
            <TableRow key={step} data-testid={`kpi-${step}`}>
              <TableCell className="whitespace-normal">
                {what}
              </TableCell>
              <TableCell>{holder}</TableCell>
              <TableCell className="tabular text-right">{BAI_TARGETS[step]} hari</TableCell>
              <TableCell className="tabular text-right">{k.total}</TableCell>
              <TableCell className="tabular text-right">{k.onTime}</TableCell>
              <TableCell className={k.late ? "text-destructive tabular text-right font-medium" : "tabular text-right"}>{k.late || "–"}</TableCell>
              <TableCell className="tabular text-right">{k.waiting || "–"}</TableCell>
              <TableCell className="tabular text-right" data-testid="pct">
                {pct(k.pct)}
              </TableCell>
              <TableCell className="tabular text-right">{days(k.averageDays)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
