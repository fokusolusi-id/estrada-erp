import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import Link from "next/link";
import { ALLOCATION_PROBLEM_LABEL, canPipeline, contribution, formatAmount, headlinePrior, pipelineTotals, pnl, scaleTo, unitDecimals, unitLabel, type Money } from "@estrada/domain";
import { loadPipeline } from "@/lib/pipeline";
import { requireUser } from "@/lib/session";
import { loadSummary, SUMMARY_ROLES, SUMMARY_STATUS, type SummaryParams } from "@/lib/summary";
import { MONTHS } from "@/components/erp/budget-grid";
import { PnlChart, RankedBars } from "@/components/erp/charts";
import { ContributionTable } from "@/components/erp/contribution-table";
import { EntityAllocationTable } from "@/components/erp/entity-allocation-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KpiCard, KpiStrip } from "@/components/erp/kpi-card";
import { PageHeader } from "@/components/erp/page-header";
import { PnlTable } from "@/components/erp/pnl-table";
import { ScopeBar } from "@/components/erp/scope-bar";
import { displayUnit } from "@/lib/display-unit";
import { activeView } from "@/lib/view-filter";
import { ViewNote } from "@/components/erp/view-note";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { rkaLabel } from "@estrada/domain";

export const metadata: Metadata = { title: "Management Summary" };

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<SummaryParams>;
}) {
  const user = await requireUser();
  if (!SUMMARY_ROLES.includes(user.actor.role)) notFound();
  const { version: versionParam, status } = await searchParams;
  const params: SummaryParams = { version: versionParam, status };
  const [{ versions, version, lines, reportLines, org, entityRows, allocationProblems, sharedLines }, unit] = await Promise.all([
    loadSummary(user, params),
    displayUnit(),
  ]);
  const view = await activeView();
  // Weighted pipeline sits beside revenue, never inside it (plan); only those who may read the register see it.
  const pipeline =
    version && canPipeline(user.actor, "view", null, org)
      ? pipelineTotals((await loadPipeline(version.fiscalYear)).deals.filter((d) => !view.entity || d.entity === view.entity))
      : null;
  const rows = pnl(reportLines);
  const row = (key: string) => rows.find((r) => r.key === key)!;
  const total = (key: string) => row(key).total;
  // Charts draw numbers already in the viewer's unit; the figures themselves stay Decimal.
  const n = (m: Money) => scaleTo(m, unit).toNumber();
  const chart = { decimals: unitDecimals(unit), unitLabel: unitLabel(unit) };
  const trend = (key: string) => row(key).months.map(n);
  // Like for like against last year's RKA, over the lines that carry it; hidden when too few do to mean much.
  const vsPrior = headlinePrior(lines);
  const enough = vsPrior.of > 0 && vsPrior.covered / vsPrior.of >= 0.5;
  const against = (version?.fiscalYear ?? new Date().getFullYear()) - 1;
  const change = (key: "Revenue" | "TotalCost" | "ProfitBeforeTax" | "CAPEX", goodWhenUp: boolean) =>
    enough && vsPrior.change(key) ? { pct: vsPrior.change(key), goodWhenUp, against } : undefined;
  const byDivision = contribution(reportLines, (l) => org.divisionOf(l.requestorUnit));
  const locked = lines.filter((l) => l.state === "locked").length;
  const exportQuery = new URLSearchParams(Object.entries({ ...params, version: version?.id }).filter((e): e is [string, string] => !!e[1])).toString();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Management Summary"
        description={<>{version ? rkaLabel(version) : "Belum ada siklus RKA yang dibuka"} · {lines.length} baris, {locked} terkunci</>}
        note={<ViewNote />}
        actions={
          version ? (
            <Button asChild variant="outline">
              <a href={`/api/export/rka?${exportQuery}`} download>
                <Download aria-hidden />
                Unduh Excel
              </a>
            </Button>
          ) : null
        }
        filters={
          <>
            <ScopeBar
              filters={[
                ...(versions.length > 1
                  ? [{ name: "version", label: "Versi", options: versions.map((v) => ({ value: v.id, label: `${rkaLabel(v)}${v.copiedFromId ? " revisi" : ""}${v.status === "locked" ? " (terkunci)" : ""}` })) }]
                  : []),
                { name: "status", label: "Status", options: Object.entries(SUMMARY_STATUS).map(([value, s]) => ({ value, label: s.label })) },
              ]}
            />
          </>
        }
      />

      <KpiStrip>
        <KpiCard label="Pendapatan" value={total("Revenue")} unit={unit} note="Rencana invoice" change={change("Revenue", true)} trend={trend("Revenue")} />
        <KpiCard label="Total Biaya" value={total("TotalCost")} unit={unit} note="COGS + OPEX + OTHERS + CAPEX" change={change("TotalCost", false)} trend={trend("TotalCost")} />
        <KpiCard label="Laba Sebelum Pajak" value={total("ProfitBeforeTax")} unit={unit} signal change={change("ProfitBeforeTax", true)} trend={trend("ProfitBeforeTax")} />
        <KpiCard label="CAPEX" value={total("CAPEX")} unit={unit} change={change("CAPEX", false)} trend={trend("CAPEX")} />
      </KpiStrip>
      {pipeline ? (
        <p className="text-muted-foreground -mt-3 text-sm" data-testid="summary-pipeline">
          Di luar RKA: pipeline tertimbang {formatAmount(pipeline.weighted, unit)} dari nilai {formatAmount(pipeline.value, unit)}.{" "}
          <Link href="/pipeline" className="text-primary underline-offset-4 hover:underline">
            Buka Pipeline
          </Link>
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Pendapatan, biaya dan laba per bulan</CardTitle>
            <CardDescription>Batang: pendapatan dan total biaya. Garis: laba sebelum pajak. Dalam {chart.unitLabel}.</CardDescription>
          </CardHeader>
          <CardContent>
            <PnlChart
              data={MONTHS.map((m, i) => ({ month: m, revenue: n(row("Revenue").months[i]!), cost: n(row("TotalCost").months[i]!), profit: n(row("ProfitBeforeTax").months[i]!) }))}
              {...chart}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Kontribusi per divisi</CardTitle>
            <CardDescription>Pendapatan dikurangi biaya, per divisi pengusul.</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars data={byDivision.map((c) => ({ name: c.key, value: n(c.net) }))} label="Kontribusi" {...chart} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan per bulan</CardTitle>
          <CardDescription>Semua angka dihitung dari baris RKA yang sama, jadi Rekap dan Kontribusi Divisi selalu sama.</CardDescription>
        </CardHeader>
        <CardContent>
          <PnlTable rows={rows} unit={unit} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kontribusi Divisi</CardTitle>
            <CardDescription>Per divisi pengusul, seperti sheet Kontribusi Divisi dan Rekap.</CardDescription>
          </CardHeader>
          <CardContent>
            <ContributionTable rows={byDivision} unit={unit} label="Divisi pengusul" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Per entitas</CardTitle>
            <CardDescription>
              {sharedLines
                ? `Setelah alokasi ${sharedLines} baris biaya bersama ke ESTRADA, MATRIK, DJALU dan PAS. Baris RKA tidak berubah.`
                : "Belum ada biaya bersama. Finance menandainya di menu Biaya Bersama."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {allocationProblems.length ? (
              <Alert>
                <AlertDescription>
                  {allocationProblems.length} baris biaya bersama belum dapat dialokasikan dan tetap di entitas asalnya:{" "}
                  {[...new Set(allocationProblems.map((p) => ALLOCATION_PROBLEM_LABEL[p.problem]))].join("; ")}.
                </AlertDescription>
              </Alert>
            ) : null}
            {sharedLines ? (
              <EntityAllocationTable rows={entityRows} unit={unit} />
            ) : (
              <ContributionTable rows={contribution(lines, (l) => l.entity)} unit={unit} label="Entitas" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
