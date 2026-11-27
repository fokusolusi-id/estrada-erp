import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AGING_BUCKETS, AGING_LABEL, agingByCustomer, can, cashInForecast, dueDate, money, reviewList, sum, unitLabel } from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { covers } from "@/lib/invoice";
import { formatDate, todayJakarta } from "@/lib/payment";
import { loadReceivables } from "@/lib/receivable";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { KpiCard, KpiStrip } from "@/components/erp/kpi-card";
import { FigureCell } from "@/components/erp/money-cell";
import { PageHeader } from "@/components/erp/page-header";
import { ViewNote } from "@/components/erp/view-note";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Piutang" };

const monthName = new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" });

export default async function ReceivablePage() {
  const user = await requireUser();
  if (!can(user.actor, "invoice.view", null, await loadOrg())) redirect("/");
  const [view, unit] = await Promise.all([activeView(), displayUnit()]);
  const { open, termins } = await loadReceivables((e) => covers(user, e) && (!view.entity || e === view.entity));
  const today = todayJakarta();
  const aging = agingByCustomer(open, today);
  const review = reviewList(open, today);
  // A termin not yet billed is expected 30 days after its planned invoice date.
  const forecast = cashInForecast(
    open.map((i) => ({ on: i.dueOn, amount: i.outstanding })),
    termins.map((t) => ({ on: dueDate(t.plannedOn, null), amount: money(t.amount) })),
    today,
  );
  const total = sum(open.map((i) => i.outstanding));
  const overdue = sum(review.filter((r) => r.daysOverdue > 0).map((r) => r.outstanding));
  const figure = (v: ReturnType<typeof sum>) => (
    <TableCell className="text-right">
      <FigureCell value={v} unit={unit} />
    </TableCell>
  );
  const empty = <p className="text-muted-foreground text-sm">Tidak ada piutang terbuka.</p>;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Piutang" description={`Invoice terbit yang belum lunas per ${formatDate(today)}. Angka dalam ${unitLabel(unit)}.`} note={<ViewNote ignores={["division"]} />} />
      <KpiStrip>
        <KpiCard label="Piutang" value={total} unit={unit} note={`${open.length} invoice`} />
        <KpiCard label="Lewat jatuh tempo" value={overdue} unit={unit} note="Perlu ditagih" signal />
      </KpiStrip>
      <Card>
        <CardHeader>
          <CardTitle>Tinjauan mingguan</CardTitle>
          <CardDescription>Invoice yang lewat jatuh tempo atau jatuh tempo dalam 7 hari, paling lama di atas.</CardDescription>
        </CardHeader>
        <CardContent>
          {review.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer · project</TableHead>
                  <TableHead>Jatuh tempo</TableHead>
                  <TableHead className="text-right">Hari lewat</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {review.map((r) => (
                  <TableRow key={r.id} data-testid={`review-${r.id}`}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <Link href={`/invoice/${r.id}`} className="underline-offset-4 hover:underline">
                        {r.number}
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-56 whitespace-normal">
                      {r.customer} · {r.project}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(r.dueOn)}</TableCell>
                    <TableCell className={`tabular text-right ${r.daysOverdue > 0 ? "text-destructive font-medium" : ""}`}>{r.daysOverdue > 0 ? r.daysOverdue : "–"}</TableCell>
                    {figure(r.outstanding)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            empty
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Umur piutang per customer</CardTitle>
        </CardHeader>
        <CardContent>
          {aging.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  {AGING_BUCKETS.map((b) => (
                    <TableHead key={b} className="text-right">
                      {AGING_LABEL[b]}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aging.map((a) => (
                  <TableRow key={a.customer} data-testid={`aging-${a.customer}`}>
                    <TableCell className="font-medium">{a.customer}</TableCell>
                    {AGING_BUCKETS.map((b) => (
                      <TableCell key={b} className="text-right">
                        <FigureCell value={a.buckets[b]} unit={unit} />
                      </TableCell>
                    ))}
                    {figure(a.total)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            empty
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Proyeksi cash-in 12 bulan</CardTitle>
          <CardDescription>Invoice terbuka pada jatuh temponya, dan termin belum ditagih 30 hari sesudah tanggal rencana (tanpa PPN). Yang sudah lewat masuk bulan berjalan.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bulan</TableHead>
                <TableHead className="text-right">Invoice terbuka</TableHead>
                <TableHead className="text-right">Termin belum ditagih</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forecast.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>{monthName.format(new Date(`${m.month}-01T00:00:00Z`))}</TableCell>
                  {figure(m.invoiced)}
                  {figure(m.planned)}
                  {figure(m.invoiced.plus(m.planned))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
