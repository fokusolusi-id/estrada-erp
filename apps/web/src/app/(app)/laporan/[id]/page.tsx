import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatIdr, money, reportActions, type ReportKind, type ReportState } from "@estrada/domain";
import { loadReport, stamp } from "@/lib/report-view";
import { requireUser } from "@/lib/session";
import { PrintButton } from "@/components/erp/bod-forms";
import { PageHeader } from "@/components/erp/page-header";
import { ReportActions } from "@/components/erp/report-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { runReportAction } from "../actions";

export const metadata: Metadata = { title: "Laporan" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const r = await loadReport(user, (await params).id);
  if (!r) notFound();
  const actions = reportActions(user.actor, { kind: r.row.kind as ReportKind, state: r.row.state as ReportState, entities: r.entities, preparedBy: r.row.preparedBy, reviewedBy: r.row.reviewedBy }, r.org);
  return (
    <div className="relative grid grid-cols-[minmax(0,1fr)] gap-6">
      <div aria-hidden className="text-foreground/10 pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
        <span className="-rotate-45 text-center text-5xl font-bold">{r.approved ? r.company : "DRAFT"}</span>
      </div>
      <PageHeader title={r.title} description={`${r.company} · versi ${r.row.version} · ${r.status} · data ${stamp(r.row.generatedAt)} · rupiah penuh`} />
      {r.contact ? <p className="text-muted-foreground -mt-4 text-xs">{r.contact}</p> : null}
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button asChild variant="outline">
          <Link href="/laporan">Semua laporan</Link>
        </Button>
        <Button asChild variant="outline">
          <a href={`/laporan/${r.row.id}/export`}>Unduh Excel</a>
        </Button>
        <PrintButton />
      </div>
      {r.row.note ? <p className="text-destructive text-sm">Dikembalikan: {r.row.note}</p> : null}
      {actions.length ? <ReportActions id={r.row.id} actions={actions} onAction={runReportAction} /> : null}
      {r.row.content.sheets.map((s) => (
        <Card key={s.name} className="min-w-0">
          <CardHeader>
            <CardTitle>{s.name}</CardTitle>
            <CardDescription>{s.rows.length} baris</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {s.columns.map((c, i) => (
                    <th key={c} className={`text-muted-foreground py-1 pr-3 text-xs font-medium ${typeof s.rows[0]?.[i] === "object" ? "text-right" : "text-left"}`}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {row.map((v, j) => (
                      <td key={j} className={`py-1.5 pr-3 ${typeof v === "object" ? "tabular text-right whitespace-nowrap" : ""}`}>{typeof v === "object" ? formatIdr(money(v.m), { decimals: 0 }) : v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
      <div className="grid gap-3 sm:grid-cols-3">
        {r.signatures.map(([label, name, at]) => (
          <div key={label} className="rounded-lg border p-3 text-sm">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="font-medium">{name}</p>
            <p className="text-muted-foreground text-xs">{stamp(at)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
