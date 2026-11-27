import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  BG_TYPE_LABEL, DRAWING_KIND_LABEL, DRAWING_STATUS_LABEL, FACILITY_TYPE_LABEL, bankConcentration, can, canConfirmRelease, formatIdr, money, sum, unitLabel,
  type Money,
} from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { coversEntity, loadObligo } from "@/lib/obligo";
import { billProjects, formatDate, todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { KpiCard, KpiStrip } from "@/components/erp/kpi-card";
import { FigureCell } from "@/components/erp/money-cell";
import { DrawingActions, DrawingForm, FacilityForm, FacilityPaymentForm, ReversePayment } from "@/components/erp/obligo-forms";
import { PageHeader } from "@/components/erp/page-header";
import { ViewNote } from "@/components/erp/view-note";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { confirmRelease, issueDrawing, recordFacilityPayment, rejectDrawing, releaseGuarantee, requestDrawing, reverseFacilityPayment, saveFacility } from "./actions";

export const metadata: Metadata = { title: "Obligo Bank" };

export default async function ObligoPage() {
  const user = await requireUser();
  const org = await loadOrg();
  if (!can(user.actor, "obligo.view", null, org)) redirect("/");
  const today = todayJakarta();
  const [view, unit, data, companies, projects] = await Promise.all([
    activeView(),
    displayUnit(),
    loadObligo(today),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
    billProjects(),
  ]);
  const mine = companies.map((c) => c.code).filter((c) => coversEntity(user.actor, c));
  const shows = (e: string | null) => (!e || coversEntity(user.actor, e)) && (!view.entity || !e || e === view.entity);
  const facilities = data.facilities.filter((f) => shows(f.entityCode));
  const drawings = data.drawings.filter((d) => shows(d.entityCode) && facilities.some((f) => f.id === d.facilityId));
  const payments = data.payments.filter((p) => shows(p.entityCode) && facilities.some((f) => f.id === p.facilityId));
  const live = facilities.filter((f) => f.active);
  const label = new Map(data.facilities.map((f) => [f.id, `${f.bankName} ${f.name}${f.entityCode ? ` · ${f.entityCode}` : ""}`]));
  const plafon = sum(live.map((f) => money(f.plafon)));
  const outstanding = sum(live.map((f) => f.outstanding));
  // The bank's share is of everything held, whatever the header filters.
  const concentrated = bankConcentration(data.facilities.filter((f) => f.active).map((f) => ({ bank: f.bankName, plafon: money(f.plafon) })));
  const mayManage = can(user.actor, "obligo.manage", null, org);
  const mayRequest = can(user.actor, "obligo.request", null, org);
  const figure = (v: Money, warn = false) => (
    <TableCell className={`text-right ${warn ? "text-destructive font-medium" : ""}`}>
      <FigureCell value={v} unit={unit} />
    </TableCell>
  );
  const section = (title: string, description: string | null, content: React.ReactNode) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4">{content}</CardContent>
    </Card>
  );
  const empty = (text: string) => <p className="text-muted-foreground text-sm">{text}</p>;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Obligo Bank" description={`Fasilitas bank, penarikan kredit dan Bank Garansi per ${formatDate(today)}. Angka tabel dalam ${unitLabel(unit)}.`} note={<ViewNote ignores={["division"]} />} />
      <KpiStrip>
        <KpiCard label="Plafon" value={plafon} unit={unit} note={`${live.length} fasilitas aktif`} />
        <KpiCard label="Outstanding" value={outstanding} unit={unit} />
        <KpiCard label="Kelonggaran" value={plafon.minus(outstanding)} unit={unit} signal />
      </KpiStrip>
      {concentrated.map((c) => (
        <p key={c.bank} role="alert" className="text-destructive text-sm">
          Konsentrasi: {c.bank} memegang {c.share.toFixed(0)}% dari seluruh plafon (batas 50%).
        </p>
      ))}
      {section(
        "Posisi fasilitas",
        null,
        facilities.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fasilitas</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Expired · bunga</TableHead>
                <TableHead className="text-right">Plafon</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Kelonggaran</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facilities.map((f) => (
                <TableRow key={f.id} data-testid={`facility-${f.id}`} className={f.active ? "" : "text-muted-foreground"}>
                  <TableCell className="min-w-48 font-medium whitespace-normal">
                    {label.get(f.id)}
                    {f.active ? null : <Badge variant="outline" className="ml-2">Nonaktif</Badge>}
                    {f.escrowAccount ? <span className="text-muted-foreground block text-xs">Escrow {f.escrowAccount}</span> : null}
                  </TableCell>
                  <TableCell>{FACILITY_TYPE_LABEL[f.type]}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {f.expiresOn ? formatDate(f.expiresOn) : "Expired belum diisi"}
                    {f.interestDay ? <span className="text-muted-foreground block text-xs">Bunga tiap tanggal {f.interestDay}</span> : null}
                  </TableCell>
                  {figure(money(f.plafon))}
                  {figure(f.outstanding)}
                  {figure(f.available, f.active && f.available.lte(0))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          empty("Belum ada fasilitas bank.")
        ),
      )}
      {section(
        "Penarikan dan Bank Garansi",
        "Permintaan diajukan PMO atau Finance, diterbitkan Cash Management. BG dilepas sesudah PM proyek mengonfirmasi kontrak selesai.",
        <>
          {drawings.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fasilitas · underlying</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>No · jatuh tempo</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drawings.map((d) => {
                  const may = {
                    decide: mayManage && d.state === "requested" && d.requestedBy !== user.id,
                    confirm: d.kind === "bg" && d.state === "issued" && !d.releaseConfirmedAt && canConfirmRelease(user.actor, d.pm, org),
                    release: mayManage && d.kind === "bg" && d.state === "issued" && !!d.releaseConfirmedAt,
                  };
                  return (
                    <TableRow key={d.id} data-testid={`drawing-${d.id}`}>
                      <TableCell className="min-w-64 whitespace-normal">
                        <span className="font-medium">{label.get(d.facilityId)}</span>
                        <span className="block text-xs">
                          {d.project ? `${d.project} · ` : ""}
                          {d.underlying}
                          {d.documentPath ? (
                            <>
                              {" · "}
                              <a href={`/obligo/dokumen/${d.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                                dokumen
                              </a>
                            </>
                          ) : null}
                        </span>
                        {d.note ? <span className="text-destructive block text-xs">{d.note}</span> : null}
                        {may.decide || may.confirm || may.release ? (
                          <div className="mt-2">
                            <DrawingActions id={d.id} today={today} may={may} onIssue={issueDrawing} onReject={rejectDrawing} onConfirm={confirmRelease} onRelease={releaseGuarantee} />
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {DRAWING_KIND_LABEL[d.kind]}
                        {d.bgType ? <span className="text-muted-foreground block text-xs">{BG_TYPE_LABEL[d.bgType]}</span> : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {d.reference ?? "–"}
                        {d.dueOn ? <span className="text-muted-foreground block text-xs">{formatDate(d.dueOn)}</span> : null}
                      </TableCell>
                      {figure(money(d.amount))}
                      {figure(d.owed)}
                      <TableCell>
                        {DRAWING_STATUS_LABEL[d.status]}
                        {d.status !== "released" && d.releaseConfirmedAt ? <span className="text-muted-foreground block text-xs">PM sudah konfirmasi</span> : null}
                        {d.opening ? <span className="text-muted-foreground block text-xs">Saldo awal</span> : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            empty("Belum ada penarikan atau Bank Garansi.")
          )}
          {mayRequest ? (
            <DrawingForm
              facilities={live.map((f) => ({ id: f.id, label: label.get(f.id)!, type: f.type, entityCode: f.entityCode }))}
              projects={projects.filter((p) => coversEntity(user.actor, p.entity))}
              entities={mine}
              onRequest={requestDrawing}
            />
          ) : null}
        </>,
      )}
      {section(
        "Pembayaran pokok dan bunga",
        "Masuk ke Kas Mingguan pada tanggal bayarnya. Nilai penuh dalam rupiah.",
        <>
          {payments.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Fasilitas · referensi</TableHead>
                  <TableHead className="text-right">Pokok</TableHead>
                  <TableHead className="text-right">Bunga</TableHead>
                  {mayManage ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id} data-testid={`facility-payment-${p.id}`}>
                    <TableCell className="whitespace-nowrap">{formatDate(p.paidOn)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {label.get(p.facilityId)} · {p.reference}
                    </TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">{formatIdr(money(p.principal))}</TableCell>
                    <TableCell className="tabular text-right whitespace-nowrap">{formatIdr(money(p.interest))}</TableCell>
                    {mayManage ? (
                      <TableCell>
                        <ReversePayment id={p.id} onReverse={reverseFacilityPayment} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            empty("Belum ada pembayaran.")
          )}
          {mayManage ? (
            <FacilityPaymentForm
              facilities={facilities.map((f) => ({ id: f.id, label: label.get(f.id)!, entityCode: f.entityCode }))}
              loans={drawings.filter((d) => d.kind === "loan" && d.owed.gt(0)).map((d) => ({ id: d.id, facilityId: d.facilityId, label: `${d.underlying} · sisa ${formatIdr(d.owed)}` }))}
              entities={mine}
              today={today}
              onRecord={recordFacilityPayment}
            />
          ) : null}
        </>,
      )}
      {mayManage
        ? section(
            "Kelola fasilitas",
            "Master fasilitas bank: plafon, expired dan tanggal bunga.",
            <FacilityForm
              entities={mine}
              onSave={saveFacility}
              facilities={data.facilities
                .filter((f) => !f.entityCode || mine.includes(f.entityCode))
                .map((f) => ({
                  id: f.id, bankName: f.bankName, name: f.name, type: f.type, entityCode: f.entityCode ?? "", plafon: formatIdr(money(f.plafon)).replace("Rp ", ""),
                  expiresOn: f.expiresOn ?? "", contractNo: f.contractNo ?? "", interestDay: f.interestDay ? String(f.interestDay) : "", escrowAccount: f.escrowAccount ?? "", active: f.active,
                }))}
            />,
          )
        : null}
    </div>
  );
}
