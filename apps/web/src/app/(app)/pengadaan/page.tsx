import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  PO_STATE_LABEL, PR_STATE_LABEL, can, canCheckBudget, canRequestPurchase, canWritePo, formatIdr, isScmHead, limitFor, money, poActions, sum, ZERO,
} from "@estrada/domain";
import { formatDate, lineOptions, todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { GoodsReceiptForm, PoActionsRow, PurchaseOrderForm, PurchaseRequestForm, RequestDecision } from "@/components/erp/procurement-forms";
import { ViewNote } from "@/components/erp/view-note";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createPurchaseRequest, decidePurchaseRequest, recordReceiptOfGoods, runPoAction, savePurchaseOrder } from "./actions";

export const metadata: Metadata = { title: "Pengadaan" };

export default async function ProcurementPage() {
  const user = await requireUser();
  const org = await loadOrg();
  const mayRead = can(user.actor, "payment.report", null, org) || can(user.actor, "master.approve", null, org) || org.isWithin(user.actor.orgUnit, "PDMS");
  if (user.actor.role === "admin" || !mayRead) redirect("/");
  const today = todayJakarta();
  const [view, requests, orders, receipts, projects, partners, products, units] = await Promise.all([
    activeView(),
    db
      .select({ request: schema.purchaseRequest, project: schema.pipelineDeal.project, by: schema.user.name })
      .from(schema.purchaseRequest)
      .innerJoin(schema.project, eq(schema.project.id, schema.purchaseRequest.projectId))
      .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.project.dealId))
      .innerJoin(schema.user, eq(schema.user.id, schema.purchaseRequest.createdBy))
      .orderBy(desc(schema.purchaseRequest.createdAt)),
    db
      .select({ order: schema.purchaseOrder, partner: schema.partner.name })
      .from(schema.purchaseOrder)
      .innerJoin(schema.partner, eq(schema.partner.id, schema.purchaseOrder.partnerId))
      .orderBy(desc(schema.purchaseOrder.createdAt)),
    db.select().from(schema.goodsReceipt).orderBy(asc(schema.goodsReceipt.receivedOn)),
    db
      .select({ id: schema.project.id, pm: schema.project.pmUserId, status: schema.project.status, name: schema.pipelineDeal.project, entity: schema.pipelineDeal.entityCode, year: schema.pipelineDeal.fiscalYear })
      .from(schema.project)
      .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.project.dealId))
      .orderBy(asc(schema.pipelineDeal.project)),
    db.select().from(schema.partner).where(eq(schema.partner.active, true)).orderBy(asc(schema.partner.name)),
    db.select().from(schema.partnerProduct).where(eq(schema.partnerProduct.active, true)).orderBy(asc(schema.partnerProduct.type)),
    db.select({ code: schema.orgUnit.code, limit: schema.orgUnit.approvalLimit }).from(schema.orgUnit),
  ]);
  const covers = (e: string) => (user.actor.entities.includes("*") || user.actor.entities.includes(e)) && (!view.entity || e === view.entity);
  const limits = new Map(units.flatMap((u) => (u.limit ? [[u.code, money(u.limit)] as const] : [])));
  const shownRequests = requests.filter((r) => covers(r.request.entityCode));
  const shownOrders = orders.filter((o) => covers(o.order.entityCode));
  const byRequest = new Map(requests.map((r) => [r.request.id, r]));
  const received = (orderId: string) => sum(receipts.filter((r) => r.orderId === orderId).map((r) => money(r.amount)));
  const mine = projects.filter((p) => p.status !== "Drop" && p.status !== "Closing" && covers(p.entity) && canRequestPurchase(user.actor, p, org));
  const years = [...new Set(mine.map((p) => p.year))];
  const lines = (await Promise.all(years.map(async (year) => (await lineOptions(user.actor, year)).lines.map((l) => ({ id: l.id, label: l.label, entity: l.entity, year }))))).flat();
  const orderable = shownRequests.filter((r) => r.request.state === "approved" && canWritePo(user.actor, r.request.entityCode, org));
  const ordered = (requestId: string) => sum(orders.filter((o) => o.order.requestId === requestId && o.order.state !== "cancelled").map((o) => money(o.order.amount)));
  const shown = (v: string) => formatIdr(money(v)).replace("Rp ", "");
  const amount = (v: string) => <TableCell className="tabular text-right align-top whitespace-nowrap">{formatIdr(money(v))}</TableCell>;
  const section = (title: string, description: string, content: React.ReactNode) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4">{content}</CardContent>
    </Card>
  );
  const empty = (text: string) => <p className="text-muted-foreground text-sm">{text}</p>;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Pengadaan" description="Permintaan dari proyek, cek budget, PO ke mitra dan BAST penerimaan. Nilai penuh, exclude PPN." note={<ViewNote ignores={["division"]} />} />
      {section(
        "Permintaan pengadaan",
        "Diajukan PM atau PMO atas baris RKA; BFP atau Finance memeriksa budgetnya.",
        <>
          {shownRequests.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor · proyek</TableHead>
                  <TableHead>Kebutuhan</TableHead>
                  <TableHead className="text-right">Perkiraan</TableHead>
                  <TableHead className="text-right">Sudah di-PO</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownRequests.map(({ request: r, project, by }) => (
                  <TableRow key={r.id} data-testid={`pr-${r.id}`}>
                    <TableCell className="min-w-56 align-top whitespace-normal">
                      <span className="font-medium">{r.number}</span>
                      <span className="text-muted-foreground block text-xs">
                        {project} · {r.entityCode} · {by}
                      </span>
                    </TableCell>
                    <TableCell className="min-w-48 align-top whitespace-normal">
                      {r.description}
                      {r.note ? <span className="text-muted-foreground block text-xs">{r.note}</span> : null}
                    </TableCell>
                    {amount(r.estimate)}
                    {amount(ordered(r.id).toFixed(2))}
                    <TableCell className="align-top">
                      <div className="grid justify-items-start gap-2">
                        {PR_STATE_LABEL[r.state]}
                        {r.state === "requested" && canCheckBudget(user.actor, { entity: r.entityCode, createdBy: r.createdBy }) ? <RequestDecision id={r.id} onDecide={decidePurchaseRequest} /> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            empty("Belum ada permintaan pengadaan.")
          )}
          {mine.length ? <PurchaseRequestForm projects={mine.map((p) => ({ id: p.id, label: `${p.name} · ${p.entity}`, entity: p.entity, year: p.year }))} lines={lines} onSave={createPurchaseRequest} /> : null}
        </>,
      )}
      {section(
        "Purchase order",
        "Dibuat SCM, disetujui Head SCM; di atas limit cost center peminta juga Head FRM lalu Direktur. Tagihan atas PO diperiksa terhadap BAST.",
        <>
          {shownOrders.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor · mitra</TableHead>
                  <TableHead>Uraian</TableHead>
                  <TableHead className="text-right">Nilai PO</TableHead>
                  <TableHead className="text-right">Diterima</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownOrders.map(({ order: o, partner }) => {
                  const r = byRequest.get(o.requestId)!;
                  const got = received(o.id);
                  const limit = limitFor(r.request.createdUnit, limits, org);
                  const actions = poActions(
                    {
                      state: o.state, entity: o.entityCode, createdBy: o.createdBy, requestedBy: r.request.createdBy,
                      createdByScmHead: isScmHead(o.createdRole, o.createdUnit), overLimit: !!limit && money(o.amount).gt(limit), received: got.gt(ZERO),
                    },
                    user.actor,
                    org,
                  );
                  const project = projects.find((p) => p.id === r.request.projectId)!;
                  const mayReceive = o.state === "approved" && got.lt(money(o.amount)) && o.createdBy !== user.id && canRequestPurchase(user.actor, project, org);
                  return (
                    <TableRow key={o.id} data-testid={`po-${o.id}`}>
                      <TableCell className="min-w-56 align-top whitespace-normal">
                        <span className="font-medium">{o.number}</span>
                        <span className="text-muted-foreground block text-xs">
                          {partner} · {r.request.number} · {formatDate(o.orderedOn)}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-48 align-top whitespace-normal">
                        {o.description}
                        <span className="text-muted-foreground block text-xs">
                          {money(o.qty).toString().replace(".", ",")} × {formatIdr(money(o.unitPrice))}
                        </span>
                        {receipts
                          .filter((x) => x.orderId === o.id)
                          .map((x) => (
                            <span key={x.id} className="text-muted-foreground block text-xs">
                              BAST {x.bastNumber} · {formatDate(x.receivedOn)} · {formatIdr(money(x.amount))}
                            </span>
                          ))}
                        {o.note ? <span className="text-destructive block text-xs">{o.note}</span> : null}
                      </TableCell>
                      {amount(o.amount)}
                      {amount(got.toFixed(2))}
                      <TableCell className="align-top">
                        <div className="grid justify-items-start gap-2">
                          {PO_STATE_LABEL[o.state]}
                          {actions.length ? <PoActionsRow id={o.id} actions={actions} onRun={runPoAction} /> : null}
                          {mayReceive ? <GoodsReceiptForm orderId={o.id} today={today} onSave={recordReceiptOfGoods} /> : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            empty("Belum ada purchase order.")
          )}
          {orderable.length ? (
            <PurchaseOrderForm
              today={today}
              onSave={savePurchaseOrder}
              requests={orderable.map((r) => ({ id: r.request.id, label: `${r.request.number} · ${r.project}`, description: r.request.description }))}
              partners={partners.map((p) => ({ id: p.id, label: p.npwp ? p.name : `${p.name} (tanpa NPWP)` }))}
              products={products.map((p) => ({ id: p.id, partnerId: p.partnerId, label: `${p.type} · ${p.brand}` }))}
              returned={shownOrders
                .filter((o) => o.order.state === "returned" && orderable.some((r) => r.request.id === o.order.requestId))
                .map(({ order: o }) => ({
                  id: o.id, label: o.number, requestId: o.requestId, partnerId: o.partnerId, productId: o.productId ?? "", description: o.description,
                  qty: money(o.qty).toString().replace(".", ","), unitPrice: shown(o.unitPrice), orderedOn: o.orderedOn,
                }))}
            />
          ) : null}
        </>,
      )}
    </div>
  );
}
