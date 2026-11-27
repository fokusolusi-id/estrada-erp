import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { AGING_BUCKETS, AGING_LABEL, PAYMENT_STATE_LABEL, agingByCustomer, can, money, nettAmount, reviewList, sum, unitLabel } from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { formatDate, todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { KpiCard, KpiStrip } from "@/components/erp/kpi-card";
import { FigureCell } from "@/components/erp/money-cell";
import { PageHeader } from "@/components/erp/page-header";
import { ViewNote } from "@/components/erp/view-note";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Hutang" };

export default async function PayablePage() {
  const user = await requireUser();
  if (!can(user.actor, "payment.report", null, await loadOrg())) redirect("/");
  const [view, unit, rows] = await Promise.all([
    activeView(),
    displayUnit(),
    db
      .select({ request: schema.paymentRequest, partner: schema.partner.name })
      .from(schema.paymentRequest)
      .innerJoin(schema.partner, eq(schema.partner.id, schema.paymentRequest.partnerId))
      .where(
        and(
          eq(schema.paymentRequest.kind, "payment"),
          isNotNull(schema.paymentRequest.partnerId),
          inArray(schema.paymentRequest.state, ["submitted", "under_review", "pending_approval", "frm_approval", "director_approval", "approved", "scheduled"]),
        ),
      ),
  ]);
  const today = todayJakarta();
  const covers = (e: string) => (user.actor.entities.includes("*") || user.actor.entities.includes(e)) && (!view.entity || e === view.entity);
  const open = rows
    .filter((r) => covers(r.request.entityCode))
    .map(({ request: r, partner }) => ({
      id: r.id,
      number: r.number ?? "",
      vendorInvoiceNo: r.vendorInvoiceNo ?? "",
      // Aged by the due date; a bill without one counts from its invoice date.
      dueOn: r.dueOn ?? r.billDate ?? today,
      state: r.state,
      customer: partner,
      outstanding: nettAmount({ gross: money(r.gross), ppn: money(r.ppn), pph: money(r.pph) }),
    }));
  const aging = agingByCustomer(open, today);
  const review = reviewList(open, today);
  const total = sum(open.map((o) => o.outstanding));
  const overdue = sum(review.filter((r) => r.daysOverdue > 0).map((r) => r.outstanding));
  const figure = (v: typeof total) => (
    <TableCell className="text-right">
      <FigureCell value={v} unit={unit} />
    </TableCell>
  );
  const empty = <p className="text-muted-foreground text-sm">Tidak ada tagihan vendor yang belum dibayar.</p>;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Hutang" description={`Tagihan Mitra yang sudah diajukan dan belum dibayar per ${formatDate(today)}, nilai nett. Angka dalam ${unitLabel(unit)}.`} note={<ViewNote ignores={["division"]} />} />
      <KpiStrip>
        <KpiCard label="Hutang" value={total} unit={unit} note={`${open.length} tagihan`} />
        <KpiCard label="Lewat jatuh tempo" value={overdue} unit={unit} note="Perlu dibayar" signal />
      </KpiStrip>
      <Card>
        <CardHeader>
          <CardTitle>Jatuh tempo minggu ini</CardTitle>
          <CardDescription>Lewat jatuh tempo atau jatuh tempo dalam 7 hari, paling lama di atas.</CardDescription>
        </CardHeader>
        <CardContent>
          {review.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Permintaan</TableHead>
                  <TableHead>Mitra · invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Jatuh tempo</TableHead>
                  <TableHead className="text-right">Hari lewat</TableHead>
                  <TableHead className="text-right">Nett</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {review.map((r) => (
                  <TableRow key={r.id} data-testid={`due-${r.id}`}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <Link href={`/pembayaran/${r.id}`} className="underline-offset-4 hover:underline">
                        {r.number || "(tanpa nomor)"}
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-56 whitespace-normal">
                      {r.customer} · {r.vendorInvoiceNo || "—"}
                    </TableCell>
                    <TableCell>{PAYMENT_STATE_LABEL[r.state]}</TableCell>
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
          <CardTitle>Umur hutang per Mitra</CardTitle>
        </CardHeader>
        <CardContent>
          {aging.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mitra</TableHead>
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
                  <TableRow key={a.customer} data-testid={`payable-${a.customer}`}>
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
    </div>
  );
}
