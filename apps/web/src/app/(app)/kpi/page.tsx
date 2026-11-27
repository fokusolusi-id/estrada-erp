import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { KPI_STATE_LABEL, ZERO, achievement, can, canEditKpi, consolidateTargets, formatIdr, kpiActions, money, phasedTarget, sum, unitLabel, type KpiTargets, type Money } from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { loadActuals, loadTargets, targetsOf, type KpiActual } from "@/lib/kpi";
import { MONTH_NAMES } from "@/lib/period";
import { formatDate, todayJakarta } from "@/lib/payment";
import { reportVersions } from "@/lib/rka";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { KpiActions, KpiForm } from "@/components/erp/kpi-forms";
import { FigureCell } from "@/components/erp/money-cell";
import { PageHeader } from "@/components/erp/page-header";
import { ViewNote } from "@/components/erp/view-note";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { runKpiAction, saveKpi } from "./actions";

export const metadata: Metadata = { title: "Target KPI" };

export default async function KpiPage() {
  const user = await requireUser();
  if (!can(user.actor, "closing.view", null, await loadOrg()) || user.actor.role === "requestor") redirect("/");
  const today = todayJakarta();
  const [view, unit, [version], companies] = await Promise.all([
    activeView(),
    displayUnit(),
    reportVersions(),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
  ]);
  const year = version?.fiscalYear ?? Number(today.slice(0, 4));
  // Months of the target year that have started.
  const month = year < Number(today.slice(0, 4)) ? 12 : year > Number(today.slice(0, 4)) ? 0 : Number(today.slice(5, 7));
  const mine = companies.map((c) => c.code).filter((c) => user.actor.entities.includes("*") || user.actor.entities.includes(c));
  const shown = view.entity && mine.includes(view.entity) ? [view.entity] : mine;
  const [targets, actuals] = await Promise.all([loadTargets(year), loadActuals(shown, year, Math.max(month, 1))]);
  const none: KpiActual = { revenueWon: ZERO, cashIn: ZERO, revenue: ZERO, ebitda: ZERO, net: ZERO };
  const actualOf = (e: string) => (month ? (actuals.get(e) ?? none) : none);
  const active = shown.flatMap((e) => (targets.of(e).active ? [{ entity: e, t: targetsOf(targets.of(e).active!) }] : []));
  const together = consolidateTargets(active.map((a) => a.t));
  const total = (pick: (a: KpiActual) => Money) => sum(shown.map((e) => pick(actualOf(e))));
  const combined: KpiActual = { revenueWon: total((a) => a.revenueWon), cashIn: total((a) => a.cashIn), revenue: total((a) => a.revenue), ebitda: total((a) => a.ebitda), net: total((a) => a.net) };

  const comparison = (t: KpiTargets, a: KpiActual) => {
    const margin = (v: Money) => (a.revenue.gt(0) ? v.times(100).div(a.revenue).toDecimalPlaces(1) : null);
    const amounts: [string, Money, Money, Money][] = [
      ["Revenue won bidding", t.revenue, phasedTarget(t.revenue, targets.seasonality, month), a.revenueWon],
      ["Cash-in", t.cashIn, phasedTarget(t.cashIn, targets.seasonality, month), a.cashIn],
    ];
    const margins: [string, Money, Money | null][] = [
      ["EBITDA %", t.ebitdaPct, margin(a.ebitda)],
      ["Net Margin %", t.netMarginPct, margin(a.net)],
    ];
    const pct = (v: Money | null) => (v ? `${v.toDecimalPlaces(1).toString().replace(".", ",")}%` : "–");
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>KPI</TableHead>
            <TableHead className="text-right">Target setahun</TableHead>
            <TableHead className="text-right">Target s.d. {month ? MONTH_NAMES[month - 1] : "—"}</TableHead>
            <TableHead className="text-right">Realisasi</TableHead>
            <TableHead className="text-right">Capaian s.d. bulan ini</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {amounts.map(([label, year_, upTo, actual]) => (
            <TableRow key={label}>
              <TableCell>{label}</TableCell>
              {[year_, upTo, actual].map((v, i) => (
                <TableCell key={i} className="text-right">
                  <FigureCell value={v} unit={unit} />
                </TableCell>
              ))}
              <TableCell className="tabular text-right">{pct(achievement(actual, upTo))}</TableCell>
            </TableRow>
          ))}
          {margins.map(([label, target, actual]) => (
            <TableRow key={label}>
              <TableCell>{label}</TableCell>
              <TableCell className="tabular text-right">{pct(target)}</TableCell>
              <TableCell className="tabular text-right">{pct(target)}</TableCell>
              <TableCell className="tabular text-right">{pct(actual)}</TableCell>
              <TableCell className="tabular text-right">{actual ? pct(achievement(actual, target)) : "–"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };
  const shownValue = (v: string) => formatIdr(money(v)).replace("Rp ", "");
  const plain = (v: string) => money(v).toString().replace(".", ",");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={`Target KPI ${year}`}
        description={`Diusulkan Direktur PT, disetujui BOD (kursi Direktur semua entitas). Realisasi otomatis dari Pipeline, penerimaan kas dan laba rugi. Angka tabel dalam ${unitLabel(unit)}.`}
        note={<ViewNote ignores={["division"]} />}
      />
      {shown.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Konsolidasi</CardTitle>
            <CardDescription>
              Jumlah target aktif {active.length} dari {shown.length} perusahaan (Direct {formatIdr(together.revenueDirect)}); realisasi seluruh perusahaan yang tampil.
            </CardDescription>
          </CardHeader>
          <CardContent>{active.length ? comparison(together, combined) : <p className="text-muted-foreground text-sm">Belum ada target aktif.</p>}</CardContent>
        </Card>
      ) : null}
      {shown.map((entity) => {
        const { latest, active: live } = targets.of(entity);
        const actions = latest ? kpiActions({ state: latest.state, entity, submittedBy: latest.submittedBy, hasDocument: !!latest.documentPath }, user.actor) : [];
        const mayEdit = canEditKpi(user.actor, entity) && latest?.state !== "submitted";
        const pending = latest && latest.id !== live?.id ? latest : null;
        return (
          <Card key={entity} data-testid={`kpi-${entity}`}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {entity}
                {latest ? <Badge variant={latest.state === "approved" ? "default" : "secondary"}>{KPI_STATE_LABEL[latest.state]}</Badge> : <Badge variant="outline">Belum diisi</Badge>}
              </CardTitle>
              <CardDescription>
                {live ? `Target aktif versi ${live.version}, disetujui ${formatDate(live.approvedAt!.toISOString().slice(0, 10))}.` : "Belum ada target aktif."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-4">
              {live ? comparison(targetsOf(live), actualOf(entity)) : null}
              {pending ? (
                <p className="text-sm">
                  Versi {pending.version} ({KPI_STATE_LABEL[pending.state].toLowerCase()}): revenue {formatIdr(money(pending.revenue))} (Direct {formatIdr(money(pending.revenueDirect))}), cash-in {formatIdr(money(pending.cashIn))}, EBITDA {plain(pending.ebitdaPct)}%, net margin {plain(pending.netMarginPct)}%.
                  {pending.note ? <span className="text-destructive block">{pending.note}</span> : null}
                </p>
              ) : null}
              {latest?.documentPath ? (
                <a href={`/kpi/dokumen/${latest.id}`} target="_blank" rel="noreferrer" className="w-fit text-sm underline underline-offset-4">
                  Keputusan direksi
                </a>
              ) : null}
              {latest && actions.length ? <KpiActions id={latest.id} actions={actions} onRun={runKpiAction} /> : null}
              {mayEdit ? (
                <KpiForm
                  key={`${entity}-${latest?.version ?? 0}`}
                  year={year}
                  entity={entity}
                  onSave={saveKpi}
                  initial={{
                    revenue: latest ? shownValue(latest.revenue) : "",
                    revenueDirect: latest ? shownValue(latest.revenueDirect) : "",
                    cashIn: latest ? shownValue(latest.cashIn) : "",
                    ebitdaPct: latest ? plain(latest.ebitdaPct) : "",
                    netMarginPct: latest ? plain(latest.netMarginPct) : "",
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
