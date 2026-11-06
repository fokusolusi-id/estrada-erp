import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { ALLOCATION_PROBLEM_LABEL, contribution, pnl } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadSummary, SUMMARY_ROLES, SUMMARY_STATUS, type SummaryParams } from "@/lib/summary";
import { ContributionTable } from "@/components/erp/contribution-table";
import { EntityAllocationTable } from "@/components/erp/entity-allocation-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { KpiCard } from "@/components/erp/kpi-card";
import { PnlTable } from "@/components/erp/pnl-table";
import { ScopeBar } from "@/components/erp/scope-bar";
import { displayUnit } from "@/lib/display-unit";
import { UnitSwitch } from "@/components/erp/unit-switch";
import { setDisplayUnit } from "@/app/(app)/unit-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Management Summary" };

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<SummaryParams>;
}) {
  const user = await requireUser();
  if (!SUMMARY_ROLES.includes(user.actor.role)) notFound();
  const params = await searchParams;
  const [{ versions, version, scoped, lines, reportLines, org, entityRows, allocationProblems, sharedLines }, unit] = await Promise.all([
    loadSummary(user, params),
    displayUnit(),
  ]);
  const entities = [...new Set(scoped.map((l) => l.entity))].sort();
  const divisions = [...new Set(scoped.map((l) => org.divisionOf(l.ownerUnit)))].sort();
  const rows = pnl(reportLines);
  const total = (key: string) => rows.find((r) => r.key === key)!.total;
  const locked = lines.filter((l) => l.state === "locked").length;
  const exportQuery = new URLSearchParams(Object.entries({ ...params, version: version?.id }).filter((e): e is [string, string] => !!e[1])).toString();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Management Summary</h1>
          <p className="text-muted-foreground text-sm">
            {version ? version.name : "Belum ada siklus RKA yang dibuka"} · {lines.length} baris, {locked} terkunci
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <UnitSwitch value={unit} onChange={setDisplayUnit} />
        <ScopeBar
          filters={[
            ...(versions.length > 1
              ? [{ name: "version", label: "Versi", options: versions.map((v) => ({ value: v.id, label: `${v.name}${v.status === "locked" ? " (terkunci)" : ""}` })) }]
              : []),
            { name: "entity", label: "Entitas", options: [{ value: "", label: "Semua entitas" }, ...entities.map((e) => ({ value: e, label: e }))] },
            { name: "division", label: "Divisi", options: [{ value: "", label: "Semua divisi" }, ...divisions.map((d) => ({ value: d, label: d }))] },
            { name: "status", label: "Status", options: Object.entries(SUMMARY_STATUS).map(([value, s]) => ({ value, label: s.label })) },
          ]}
        />
          {version && (
            <Button asChild variant="outline">
              <a href={`/api/export/rka?${exportQuery}`} download>
                <Download aria-hidden />
                Unduh Excel
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Pendapatan" value={total("Revenue")} unit={unit} note="Rencana invoice" />
        <KpiCard label="Total Biaya" value={total("TotalCost")} unit={unit} note="COGS + OPEX + OTHERS + CAPEX" />
        <KpiCard label="Laba Sebelum Pajak" value={total("ProfitBeforeTax")} unit={unit} />
        <KpiCard label="CAPEX" value={total("CAPEX")} unit={unit} />
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
            <ContributionTable rows={contribution(reportLines, (l) => org.divisionOf(l.requestorUnit))} unit={unit} label="Divisi pengusul" />
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
