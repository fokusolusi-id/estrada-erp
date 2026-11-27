import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { REPORT_KIND_LABEL, REPORT_STATE_LABEL, canPrepareReport, canViewReport, periodLabel, type PeriodType, type ReportKind, type ReportState } from "@estrada/domain";
import { bodScope } from "@/lib/bod";
import { formatDate } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { GenerateReportForm } from "@/components/erp/report-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateReport } from "./actions";

export const metadata: Metadata = { title: "Laporan Berkala" };

export default async function ReportsPage() {
  const user = await requireUser();
  const org = await loadOrg();
  const { role } = user.actor;
  if (!(role === "finance" || role === "director" || role === "auditor" || (role === "division_owner" && org.isWithin(user.actor.orgUnit, "FRM")))) redirect("/");
  const [{ year, month }, rows, companies] = await Promise.all([
    bodScope(user, undefined),
    db
      .select({ id: schema.periodicReport.id, kind: schema.periodicReport.kind, periodType: schema.periodicReport.periodType, periodNo: schema.periodicReport.periodNo, year: schema.periodicReport.year, scope: schema.periodicReport.scope, version: schema.periodicReport.version, state: schema.periodicReport.state, generatedAt: schema.periodicReport.generatedAt })
      .from(schema.periodicReport)
      .orderBy(desc(schema.periodicReport.generatedAt)),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
  ]);
  const codes = companies.map((c) => c.code);
  const shown = rows.filter((r) => canViewReport(user.actor, { state: r.state as ReportState, entities: r.scope.split("+") }, org));
  const options = [
    ...(canPrepareReport(user.actor, codes) ? [{ value: "KONSOLIDASI", label: "Konsolidasi" }] : []),
    ...codes.filter((c) => canPrepareReport(user.actor, [c])).map((c) => ({ value: c, label: c })),
  ];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Laporan Berkala" description="Bulanan, triwulan, semester dan tahunan per perusahaan atau konsolidasi, dengan review dan persetujuan." />
      {options.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Buat laporan</CardTitle>
          </CardHeader>
          <CardContent>
            <GenerateReportForm year={year} month={month} companies={options} onGenerate={generateReport} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardContent className="grid gap-2">
          {shown.length ? (
            shown.map((r) => (
              <div key={r.id} data-testid="report-row" className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm">
                <span>
                  <Link href={`/laporan/${r.id}`} className="font-medium underline">
                    {REPORT_KIND_LABEL[r.kind as ReportKind]} {periodLabel(r.periodType as PeriodType, r.periodNo, r.year)}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    {r.scope.includes("+") ? "Konsolidasi" : r.scope} · v{r.version} · {formatDate(r.generatedAt.toISOString().slice(0, 10))}
                  </span>
                </span>
                <Badge variant="outline">{REPORT_STATE_LABEL[r.state as ReportState]}</Badge>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">Belum ada laporan.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
