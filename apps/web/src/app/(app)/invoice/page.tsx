import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { INVOICE_STATE_LABEL, can, formatIdr, money } from "@estrada/domain";
import { billableTermins, covers } from "@/lib/invoice";
import { formatDate } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { ViewNote } from "@/components/erp/view-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage() {
  const user = await requireUser();
  const org = await loadOrg();
  if (!can(user.actor, "invoice.view", null, org)) redirect("/");
  const mayCreate = can(user.actor, "invoice.create", null, org);
  const [termins, rows, view] = await Promise.all([
    billableTermins(),
    db
      .select({ invoice: schema.invoice, customer: schema.customer.nickname, project: schema.pipelineDeal.project })
      .from(schema.invoice)
      .innerJoin(schema.customer, eq(schema.customer.id, schema.invoice.customerId))
      .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.invoice.dealId))
      .orderBy(desc(schema.invoice.createdAt)),
    activeView(),
  ]);
  const shown = (entity: string) => covers(user, entity) && (!view.entity || entity === view.entity);
  const ready = termins.filter((t) => shown(t.entity));
  const invoices = rows.filter((r) => shown(r.invoice.entityCode));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Invoice" description="Penagihan per termin: Accounting membuat dan memvalidasi pajak, Division Owner FRM menyetujui dan menerbitkan." note={<ViewNote ignores={["division"]} />} />
      <Card>
        <CardHeader>
          <CardTitle>Daftar invoice</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Customer · project</TableHead>
                  <TableHead>Entitas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Jatuh tempo</TableHead>
                  <TableHead className="text-right">Nilai invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map(({ invoice: i, customer, project }) => (
                  <TableRow key={i.id} data-testid={`invoice-${i.id}`}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <Link href={`/invoice/${i.id}`} className="underline-offset-4 hover:underline">
                        {i.number ?? "(draft)"}
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-56 whitespace-normal">
                      {customer} · {project} · termin {i.terminNo}
                    </TableCell>
                    <TableCell>{i.entityCode}</TableCell>
                    <TableCell>
                      <Badge variant={i.state === "issued" ? "default" : "outline"}>{INVOICE_STATE_LABEL[i.state]}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(i.dueOn)}</TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">{formatIdr(money(i.total))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">Belum ada invoice.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Termin siap ditagih</CardTitle>
          <CardDescription>Billing termin dari deal yang sudah punya proyek dan belum ditagih. Termin diisi BCD di Pipeline.</CardDescription>
        </CardHeader>
        <CardContent>
          {ready.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Entitas</TableHead>
                  <TableHead>Termin</TableHead>
                  <TableHead>Rencana</TableHead>
                  <TableHead className="text-right">Nilai (excl. PPN)</TableHead>
                  {mayCreate ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ready.map((t) => (
                  <TableRow key={`${t.dealId}-${t.no}`} data-testid={`termin-${t.dealId}-${t.no}`}>
                    <TableCell className="min-w-56 font-medium whitespace-normal">{t.project}</TableCell>
                    <TableCell>{t.customer}</TableCell>
                    <TableCell>{t.entity}</TableCell>
                    <TableCell>
                      {t.no}
                      {t.description ? ` · ${t.description}` : ""}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(t.plannedOn)}</TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">{formatIdr(money(t.amount))}</TableCell>
                    {mayCreate ? (
                      <TableCell>
                        {t.customerId ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/invoice/baru?deal=${t.dealId}&termin=${t.no}`}>Buat invoice</Link>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">Customer belum terhubung</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">Tidak ada termin yang menunggu. Termin muncul setelah deal punya proyek dan Billing Termin.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
