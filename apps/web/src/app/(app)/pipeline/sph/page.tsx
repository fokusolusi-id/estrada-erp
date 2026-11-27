import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { SPH_STATE_LABEL, canPipeline, formatIdr, isLost, money, sphActions, sphMargin } from "@estrada/domain";
import { formatDate, todayJakarta } from "@/lib/payment";
import { loadPipeline, pipelineYear } from "@/lib/pipeline";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { SphActions, SphForm } from "@/components/erp/sph-forms";
import { ViewNote } from "@/components/erp/view-note";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { runSphAction, saveSph } from "./actions";

export const metadata: Metadata = { title: "SPH" };

export default async function SphPage() {
  const user = await requireUser();
  const org = await loadOrg();
  if (!canPipeline(user.actor, "view", null, org) && user.actor.role !== "bfp") redirect("/");
  const [view, year, rows] = await Promise.all([
    activeView(),
    pipelineYear(),
    db
      .select({ sph: schema.sph, project: schema.pipelineDeal.project, customer: schema.pipelineDeal.customer, by: schema.user.name })
      .from(schema.sph)
      .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.sph.dealId))
      .innerJoin(schema.user, eq(schema.user.id, schema.sph.createdBy))
      .orderBy(desc(schema.sph.createdAt)),
  ]);
  const covers = (e: string) => (user.actor.entities.includes("*") || user.actor.entities.includes(e)) && (!view.entity || e === view.entity);
  const list = rows.filter((r) => covers(r.sph.entityCode));
  const editable = (year ? (await loadPipeline(year)).deals : []).filter((d) => !isLost(d.status) && covers(d.entity) && canPipeline(user.actor, "edit", d.entity, org));
  const shown = (v: string) => formatIdr(money(v)).replace("Rp ", "");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="SPH" description="Surat Penawaran Harga: ditulis Sales, direview Pricing (BFP), disetujui Head BusDev (Direktur bila penulisnya Head BusDev). Nilai penuh, exclude PPN." note={<ViewNote ignores={["division"]} />} />
      <Card>
        <CardHeader>
          <CardTitle>Daftar SPH</CardTitle>
          <CardDescription>SPH hanya boleh dikirim ke customer sesudah disetujui.</CardDescription>
        </CardHeader>
        <CardContent>
          {list.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor · tanggal</TableHead>
                  <TableHead>Deal</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead className="text-right">COGS · margin</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map(({ sph: s, project, customer, by }) => {
                  const actions = sphActions({ ...s, entity: s.entityCode }, user.actor, org);
                  return (
                    <TableRow key={s.id} data-testid={`sph-${s.id}`}>
                      <TableCell className="align-top whitespace-nowrap">
                        <span className="font-medium">{s.number}</span>
                        <span className="text-muted-foreground block text-xs">
                          {formatDate(s.issuedOn)} · {by}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-64 align-top whitespace-normal">
                        {project}
                        <span className="text-muted-foreground block text-xs">
                          {customer} · {s.entityCode} · {s.description}
                        </span>
                        {s.note ? <span className="text-destructive block text-xs">{s.note}</span> : null}
                      </TableCell>
                      <TableCell className="tabular text-right align-top whitespace-nowrap">{formatIdr(money(s.price))}</TableCell>
                      <TableCell className="tabular text-right align-top whitespace-nowrap">
                        {formatIdr(money(s.cogs))}
                        <span className="text-muted-foreground block text-xs">{sphMargin(money(s.price), money(s.cogs)).toString().replace(".", ",")}%</span>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="grid justify-items-start gap-2">
                          {SPH_STATE_LABEL[s.state]}
                          {actions.length ? <SphActions id={s.id} actions={actions} onRun={runSphAction} /> : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">Belum ada SPH.</p>
          )}
        </CardContent>
      </Card>
      {editable.length ? (
        <SphForm
          today={todayJakarta()}
          onSave={saveSph}
          deals={editable.map((d) => ({ id: d.id, label: `${d.project} · ${d.customer} · ${d.entity}`, value: shown(d.value) }))}
          returned={list
            .filter((r) => r.sph.state === "returned" && editable.some((d) => d.id === r.sph.dealId))
            .map((r) => ({ id: r.sph.id, label: r.sph.number, dealId: r.sph.dealId, issuedOn: r.sph.issuedOn, price: shown(r.sph.price), cogs: shown(r.sph.cogs), description: r.sph.description }))}
        />
      ) : null}
    </div>
  );
}
