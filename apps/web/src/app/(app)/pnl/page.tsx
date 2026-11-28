import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { REPORT_PERIODS, REPORT_PERIOD_LABEL, STATEMENT_LABEL, STATEMENT_RESULTS, STATEMENT_ROWS, can, statement, unitLabel, type Money } from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { activeYear } from "@/lib/fiscal-year";
import { MONTH_NAMES } from "@/lib/period";
import { loadPnlReport } from "@/lib/pnl-report";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { KpiCard, KpiStrip } from "@/components/erp/kpi-card";
import { FigureCell } from "@/components/erp/money-cell";
import { PageHeader } from "@/components/erp/page-header";
import { ViewNote } from "@/components/erp/view-note";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Laba Rugi" };

const SELECT = "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

export default async function PnlPage({ searchParams }: { searchParams: Promise<{ bulan?: string; periode?: string; mentah?: string }> }) {
  const user = await requireUser();
  if (!can(user.actor, "closing.view", null, await loadOrg())) redirect("/");
  const asked = await searchParams;
  const [view, unit, budgetYear] = await Promise.all([activeView(), displayUnit(), activeYear()]);
  const r = await loadPnlReport(user.actor, asked, view.entity);
  const range = r.months.length > 1 ? `${MONTH_NAMES[r.months[0]! - 1]}–${MONTH_NAMES[r.months.at(-1)! - 1]} ${r.year}` : `${MONTH_NAMES[r.months[0]! - 1]} ${r.year}`;
  const of = (key: (typeof STATEMENT_ROWS)[number]) => r.rows.find((x) => x.key === key)!;
  const consolidated = r.entities.length > 1;
  const recorded = r.perEntity.some((e) => e.lines.length > 0);
  const figure = (v: Money, key: string) => (
    <TableCell key={key} className="text-right">
      <FigureCell value={v} unit={unit} />
    </TableCell>
  );
  const percent = (v: Money | null) => <TableCell className="tabular text-right">{v ? `${v.toFixed(1)}%` : "–"}</TableCell>;
  const perEntity = r.perEntity.map((e) => ({ entity: e.entity, s: statement(e.lines) }));
  const query = new URLSearchParams({ bulan: r.bulan, periode: r.period, ...(r.eliminate ? {} : { mentah: "1" }) }).toString();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={`Laba Rugi ${range}`}
        description={`${consolidated ? `Konsolidasi ${r.entities.join(", ")}, ${r.eliminate ? "sesudah" : "sebelum"} eliminasi antar perusahaan` : `Entitas ${r.entities.join(", ")}`}. ${r.closedMonths ? `${r.closedMonths} bulan-perusahaan dari snapshot tutup buku, selebihnya angka berjalan.` : "Angka berjalan: belum ada bulan yang ditutup."} Angka dalam ${unitLabel(unit)}.`}
        note={<ViewNote ignores={["division"]} />}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Bulan</span>
            <Input type="month" name="bulan" aria-label="Bulan" defaultValue={r.bulan} className="w-48" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Periode</span>
            <select name="periode" aria-label="Periode" defaultValue={r.period} className={SELECT}>
              {REPORT_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {REPORT_PERIOD_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          {consolidated ? (
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="mentah" value="1" defaultChecked={!r.eliminate} /> Sebelum eliminasi
            </label>
          ) : null}
          <Button type="submit" variant="outline">
            Tampilkan
          </Button>
        </form>
        <Button asChild variant="outline">
          <a href={`/pnl/export?${query}`}>Unduh Excel</a>
        </Button>
      </div>
      {budgetYear !== null && budgetYear !== r.year ? (
        <p className="text-muted-foreground text-sm">
          Layar ini mengikuti bulan yang dipilih ({r.year}), bukan tahun RKA {budgetYear} di kepala halaman.
        </p>
      ) : null}
      {r.budgetFound ? null : <p className="text-destructive text-sm">Belum ada RKA {r.year}: kolom RKA kosong.</p>}
      <KpiStrip>
        {(["revenue", "gross", "ebitda", "net"] as const).map((key) => (
          <KpiCard key={key} missing={recorded ? undefined : "Belum ada realisasi untuk periode ini."} label={STATEMENT_LABEL[key]} value={of(key).actual} unit={unit} signal={key !== "revenue"} note={of(key).achieved ? `${of(key).achieved!.toFixed(1)}% dari RKA` : "Tanpa pembanding RKA"} />
        ))}
      </KpiStrip>
      {/* Tables of dashes say less than one sentence. */}
      {!recorded && !r.budgetFound ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">Belum ada realisasi maupun RKA untuk periode ini. Pilih bulan lain di atas.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Realisasi terhadap RKA</CardTitle>
              <CardDescription>Selisih = realisasi dikurangi RKA. Buka sebuah baris untuk rincian akunnya.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pos</TableHead>
                    <TableHead className="text-right">Realisasi</TableHead>
                    <TableHead className="text-right">RKA</TableHead>
                    <TableHead className="text-right">Selisih</TableHead>
                    <TableHead className="text-right">Capaian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.rows.map((row) => (
                    <TableRow key={row.key} data-testid={`pnl-${row.key}`} className={STATEMENT_RESULTS.includes(row.key) ? "bg-muted/40 font-medium" : ""}>
                      <TableCell className="min-w-64 align-top whitespace-normal">
                        {row.accounts.length ? (
                          <details>
                            <summary className="cursor-pointer">{STATEMENT_LABEL[row.key]}</summary>
                            <ul className="mt-2 grid gap-1 text-xs font-normal">
                              {row.accounts.map((a) => (
                                <li key={a.coaCode} className="flex flex-wrap justify-between gap-x-4">
                                  <span>
                                    {a.coaCode ? `${a.coaCode} · ` : ""}
                                    {a.name}
                                  </span>
                                  <span className="tabular text-muted-foreground flex gap-1">
                                    <FigureCell value={a.actual} unit={unit} /> / <FigureCell value={a.budget} unit={unit} />
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : (
                          STATEMENT_LABEL[row.key]
                        )}
                      </TableCell>
                      {figure(row.actual, "actual")}
                      {figure(row.budget, "budget")}
                      {figure(row.variance, "variance")}
                      {percent(row.achieved)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {consolidated ? (
            <Card>
              <CardHeader>
                <CardTitle>Per entitas</CardTitle>
                <CardDescription>Realisasi tiap perusahaan sebelum eliminasi.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pos</TableHead>
                      {perEntity.map((e) => (
                        <TableHead key={e.entity} className="text-right">
                          {e.entity}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {STATEMENT_ROWS.map((key) => (
                      <TableRow key={key} className={STATEMENT_RESULTS.includes(key) ? "bg-muted/40 font-medium" : ""}>
                        <TableCell>{STATEMENT_LABEL[key]}</TableCell>
                        {perEntity.map((e) => figure(e.s[key], e.entity))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
          {consolidated && r.pairs.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Antar perusahaan</CardTitle>
                <CardDescription>Penjualan satu perusahaan grup kepada yang lain, dan biaya yang dicatat pembelinya. Selisih perlu diperiksa.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Penjual → pembeli</TableHead>
                      <TableHead className="text-right">Pendapatan penjual</TableHead>
                      <TableHead className="text-right">Biaya pembeli</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.pairs.map((p) => (
                      <TableRow key={`${p.seller}-${p.buyer}`}>
                        <TableCell className="font-medium">
                          {p.seller} → {p.buyer}
                        </TableCell>
                        {figure(p.revenue, "revenue")}
                        {figure(p.cost, "cost")}
                        {figure(p.revenue.minus(p.cost), "gap")}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
