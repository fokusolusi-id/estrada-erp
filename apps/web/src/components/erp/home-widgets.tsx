import Link from "next/link";
import { DEAL_STATUS_LABEL, PROJECT_STATUS_LABEL, formatAmount, unitLabel, type DealStatus, type Money, type ProjectStatus, type Unit, type UnitSpending } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FigureCell } from "./money-cell";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const percent = (v: Money | null) => (v ? `${v.toFixed(1).replace(".", ",")}%` : "—");
const empty = <p className="text-muted-foreground text-sm">Belum ada data.</p>;
const num = "text-right";

/** One Beranda card; `href` only when the role has that screen in its menu. */
export function WidgetCard({ title, description, href, children }: { title: string; description: string; href?: string | undefined; children: React.ReactNode }) {
  return (
    <Card className="min-w-0 content-start">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2">
          {title}
          {href ? (
            <Link href={href} aria-label={`Rincian ${title}`} className="text-primary text-sm font-normal underline-offset-2 hover:underline">
              Rincian
            </Link>
          ) : null}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-3">{children}</CardContent>
    </Card>
  );
}

function Grid({ heads, children }: { heads: readonly string[]; children: React.ReactNode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {heads.map((h, i) => (
            <TableHead key={h} className={i ? num : undefined}>
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

export function SpendingCard({ title, description, rows, unit, href, runRate = false }: { title: string; description: string; rows: readonly UnitSpending[]; unit: Unit; href?: string | undefined; runRate?: boolean }) {
  const money = (v: Money | null) => <TableCell className={num}>{v ? <FigureCell value={v} unit={unit} /> : "—"}</TableCell>;
  return (
    <WidgetCard title={title} description={`${description} (${unitLabel(unit)})`} href={href}>
      {rows.length ? (
        <Grid heads={runRate ? ["Unit", "Anggaran", "Realisasi", "Run rate", "Terpakai"] : ["Divisi", "Anggaran", "Realisasi", "Komitmen", "Sisa", "Terpakai"]}>
          {rows.map((r) => (
            <TableRow key={r.unit} data-testid={`spend-${r.unit}`}>
              <TableCell className="font-medium">
                {r.unit}
                {r.flagged ? (
                  <Badge variant="secondary" className="ml-2">
                    Varians &gt; 10%
                  </Badge>
                ) : null}
              </TableCell>
              {money(r.budget)}
              {money(r.actual)}
              {runRate ? money(r.runRate) : money(r.committed)}
              {runRate ? null : money(r.remaining)}
              <TableCell className={`${num} tabular`}>{percent(r.utilisation)}</TableCell>
            </TableRow>
          ))}
        </Grid>
      ) : (
        empty
      )}
    </WidgetCard>
  );
}

export function CashCard({ description, cash, unit, href }: { description: string; cash: { in: Money[]; out: Money[]; closing: Money[]; ending: Money; runwayMonths: Money | null } | null; unit: Unit; href?: string | undefined }) {
  return (
    <WidgetCard title="Arus kas" description={`${description} (${unitLabel(unit)})`} href={href}>
      {cash ? (
        <>
          <p className="text-sm">
            Saldo akhir tahun <strong className="tabular">{formatAmount(cash.ending, unit)}</strong> · runway{" "}
            <strong className="tabular">{cash.runwayMonths ? `${cash.runwayMonths.toString().replace(".", ",")} bulan` : "—"}</strong>
          </p>
          <Grid heads={["Bulan", "Masuk", "Keluar", "Saldo"]}>
            {MONTHS.map((m, i) => (
              <TableRow key={m}>
                <TableCell>{m}</TableCell>
                {[cash.in[i]!, cash.out[i]!, cash.closing[i]!].map((v, j) => (
                  <TableCell key={j} className={num}>
                    <FigureCell value={v} unit={unit} signal={j === 2} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </Grid>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Asumsi arus kas belum diisi.</p>
      )}
    </WidgetCard>
  );
}

export function ObligoCard({
  obligo,
  unit,
  href,
}: {
  obligo: { rows: { name: string; limit: Money | null; outstanding: Money; available: Money | null; utilisation: Money | null }[]; limit: Money; outstanding: Money; concentrated: string | null };
  unit: Unit;
  href?: string | undefined;
}) {
  return (
    <WidgetCard title="Obligo bank" description={`Plafon, terpakai dan sisa per fasilitas pinjaman (${unitLabel(unit)})`} href={href}>
      {obligo.concentrated ? <p className="text-warning-foreground text-sm">Konsentrasi: {obligo.concentrated} memegang lebih dari 50% plafon.</p> : null}
      {obligo.rows.length ? (
        <Grid heads={["Fasilitas", "Plafon", "Outstanding", "Tersedia", "Terpakai"]}>
          {obligo.rows.map((r) => (
            <TableRow key={r.name}>
              <TableCell className="font-medium whitespace-normal">{r.name}</TableCell>
              <TableCell className={num}>{r.limit ? <FigureCell value={r.limit} unit={unit} /> : "—"}</TableCell>
              <TableCell className={num}>
                <FigureCell value={r.outstanding} unit={unit} />
              </TableCell>
              <TableCell className={num}>{r.available ? <FigureCell value={r.available} unit={unit} signal /> : "—"}</TableCell>
              <TableCell className={`${num} tabular`}>{percent(r.utilisation)}</TableCell>
            </TableRow>
          ))}
        </Grid>
      ) : (
        empty
      )}
    </WidgetCard>
  );
}

export function PipelineCard({ year, rows, unit, href }: { year: number | null; rows: { status: DealStatus; deals: number; value: Money; weighted: Money; ageDays: number }[]; unit: Unit; href?: string | undefined }) {
  return (
    <WidgetCard title="Pipeline" description={`Per status ${year ?? ""}: nilai tanpa PPN (${unitLabel(unit)}) dan rata-rata umur sejak dicatat`} href={href}>
      {rows.length ? (
        <Grid heads={["Status", "Deal", "Nilai", "Tertimbang", "Umur (hari)"]}>
          {rows.map((r) => (
            <TableRow key={r.status}>
              <TableCell className="font-medium">
                {r.status} · {DEAL_STATUS_LABEL[r.status]}
              </TableCell>
              <TableCell className={`${num} tabular`}>{r.deals}</TableCell>
              <TableCell className={num}>
                <FigureCell value={r.value} unit={unit} />
              </TableCell>
              <TableCell className={num}>
                <FigureCell value={r.weighted} unit={unit} />
              </TableCell>
              <TableCell className={`${num} tabular`}>{r.ageDays}</TableCell>
            </TableRow>
          ))}
        </Grid>
      ) : (
        empty
      )}
    </WidgetCard>
  );
}

export function HeadcountCard({ rows }: { rows: { unit: string; actual: number; planned: number }[] }) {
  return (
    <WidgetCard title="Headcount" description="Karyawan aktif per unit dan posisi yang direncanakan di RKA. Hanya jumlah orang.">
      {rows.length ? (
        <Grid heads={["Unit", "Karyawan aktif", "Rencana RKA"]}>
          {rows.map((r) => (
            <TableRow key={r.unit}>
              <TableCell className="font-medium">{r.unit}</TableCell>
              <TableCell className={`${num} tabular`}>{r.actual}</TableCell>
              <TableCell className={`${num} tabular`}>{r.planned || "–"}</TableCell>
            </TableRow>
          ))}
        </Grid>
      ) : (
        empty
      )}
    </WidgetCard>
  );
}

export function ProjectsCard({ rows, unit, href }: { rows: { id: string; name: string; status: ProjectStatus; value: Money }[]; unit: Unit; href?: string | undefined }) {
  return (
    <WidgetCard title="Proyek" description={`Daftar proyek, status dan nilai kontrak tanpa PPN (${unitLabel(unit)})`} href={href}>
      {rows.length ? (
        <Grid heads={["Proyek", "Status", "Nilai"]}>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium whitespace-normal">{r.name}</TableCell>
              <TableCell className={num}>{PROJECT_STATUS_LABEL[r.status]}</TableCell>
              <TableCell className={num}>
                <FigureCell value={r.value} unit={unit} />
              </TableCell>
            </TableRow>
          ))}
        </Grid>
      ) : (
        empty
      )}
    </WidgetCard>
  );
}
