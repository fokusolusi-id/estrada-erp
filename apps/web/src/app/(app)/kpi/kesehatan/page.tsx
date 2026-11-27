import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { BAND_LABEL, HEALTH_ACTION, HEALTH_INFO, STRESS_CASH_IN_DROP, can, formatAmount, unitLabel, type Money } from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { loadHealth } from "@/lib/kpi-health";
import { MONTH_NAMES } from "@/lib/period";
import { todayJakarta } from "@/lib/payment";
import { reportVersions } from "@/lib/rka";
import { requireUser } from "@/lib/session";
import { activeView } from "@/lib/view-filter";
import { loadOrg } from "@/lib/workflow";
import { BAND_TONE, BandBadge, healthFigure } from "@/components/erp/health-badge";
import { PageHeader } from "@/components/erp/page-header";
import { ViewNote } from "@/components/erp/view-note";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Kesehatan KPI" };

export default async function KpiHealthPage({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const user = await requireUser();
  if (!can(user.actor, "closing.view", null, await loadOrg()) || user.actor.role === "requestor") redirect("/");
  const today = todayJakarta();
  const [view, unit, [version], companies, asked] = await Promise.all([
    activeView(),
    displayUnit(),
    reportVersions(),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
    searchParams,
  ]);
  const fallback = version && String(version.fiscalYear) !== today.slice(0, 4) ? `${version.fiscalYear}-${version.fiscalYear < Number(today.slice(0, 4)) ? "12" : "01"}` : today.slice(0, 7);
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked.bulan ?? "") ? asked.bulan! : fallback;
  const [year, month] = [Number(period.slice(0, 4)), Number(period.slice(5, 7))];
  const mine = companies.map((c) => c.code).filter((c) => user.actor.entities.includes("*") || user.actor.entities.includes(c));
  const chosen = view.entity && mine.includes(view.entity) ? [view.entity] : mine;
  const data = await loadHealth(user, chosen, year, month, today, chosen.length > 1);
  const rupiah = (v: Money) => formatAmount(v, unit);
  const counts = (["healthy", "watch", "critical"] as const).map((b) => `${data.kpis.filter((k) => k.band === b).length} ${BAND_LABEL[b]}`).join(" · ");
  const stress: [string, string, boolean | null, string][] = [
    [
      `Kas masuk turun ${STRESS_CASH_IN_DROP}%`,
      data.stress.cashIn ? `Saldo proyeksi terendah ${rupiah(data.stress.cashIn.lowest)} pada ${MONTH_NAMES[data.stress.cashIn.month - 1]}` : "Belum ada proyeksi Arus Kas",
      data.stress.cashIn ? data.stress.cashIn.lowest.isNegative() : null,
      "Aktifkan opsi tarik BG / KMK atau tunda CapEx.",
    ],
    [
      "Liabilitas jatuh tempo 3 bulan (batas 40%)",
      data.stress.liabilities ? `${data.stress.liabilities.share.toString().replace(".", ",")}% dari total liabilitas` : "Neraca belum lengkap",
      data.stress.liabilities?.triggered ?? null,
      "Refinancing atau negosiasi tenor dengan bank.",
    ],
    [
      "Konsentrasi customer (batas 50%)",
      data.stress.customer ? `${data.stress.customer.name}: ${data.stress.customer.share.toString().replace(".", ",")}% dari pendapatan` : "Belum ada invoice terbit",
      data.stress.customer?.triggered ?? null,
      "Diversifikasi pipeline ke customer lain.",
    ],
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={`Kesehatan KPI ${MONTH_NAMES[month - 1]} ${year}`}
        description={`${chosen.length > 1 ? "Konsolidasi" : chosen[0]}: ${counts}. Tahun berjalan sampai bulan ini; nilai rupiah dalam ${unitLabel(unit)}.`}
        note={<ViewNote ignores={["division"]} />}
      />
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Bulan</span>
          <Input type="month" name="bulan" aria-label="Bulan" defaultValue={period} className="w-48" />
        </label>
        <Button type="submit" variant="outline">
          Tampilkan
        </Button>
      </form>
      {data.missingSheets.length ? <p className="text-destructive text-sm">Total neraca belum diisi untuk {data.missingSheets.join(", ")} (Tutup Buku): KPI neraca tidak dihitung.</p> : null}
      {data.hasForecast ? null : <p className="text-destructive text-sm">Proyeksi Arus Kas {year} belum ada: KPI kas tidak dihitung.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.kpis.map((k) => (
          <Card key={k.key} data-testid={`health-${k.key}`} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardDescription className="font-medium">{HEALTH_INFO[k.key].name}</CardDescription>
            </CardHeader>
            <CardContent className="grid justify-items-start gap-1 px-4">
              <span className="tabular text-xl font-semibold">{k.value ? healthFigure(k.key, k.value, unit) : "–"}</span>
              <BandBadge band={k.band} />
              <span className="text-muted-foreground text-xs">{HEALTH_INFO[k.key].formula}</span>
              <span className="text-muted-foreground text-xs">Sehat: {HEALTH_INFO[k.key].healthy}</span>
              {k.band && k.band !== "healthy" ? <span className="text-xs">{HEALTH_ACTION[k.key]}</span> : null}
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Stress test</CardTitle>
          <CardDescription>Dihitung saat halaman dibuka, dari data yang tampil.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {stress.map(([name, result, triggered, action]) => (
            <div key={name} className="grid gap-1 border-b pb-3 text-sm">
              <span className="flex flex-wrap items-center gap-2 font-medium">
                {name}
                {triggered === null ? <Badge variant="outline">Belum ada data</Badge> : <Badge className={`border-transparent ${BAND_TONE[triggered ? "critical" : "healthy"]}`}>{triggered ? "Terpicu" : "Aman"}</Badge>}
              </span>
              <span>{result}</span>
              {triggered ? <span className="text-muted-foreground text-xs">{action}</span> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
