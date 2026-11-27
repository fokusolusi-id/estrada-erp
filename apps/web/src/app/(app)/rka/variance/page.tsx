import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { REPORT_PERIOD_LABEL, canNoteVariance, formatAmount, rkaLabel, varianceOf, type Money } from "@estrada/domain";
import { displayUnit } from "@/lib/display-unit";
import { loadMonitor, readPeriod } from "@/lib/monitor";
import { PeriodSelector } from "@/components/erp/period-selector";
import { navFor } from "@/lib/nav";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { VarianceTable, type VarianceRow } from "@/components/erp/variance-table";
import { ViewNote } from "@/components/erp/view-note";
import { Card, CardContent } from "@/components/ui/card";
import { saveVarianceNote } from "./actions";

export const metadata: Metadata = { title: "Analisis Varians" };

const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

export default async function VariancePage({ searchParams }: PageProps<"/rka/variance">) {
  const user = await requireUser();
  if (!navFor(user.actor.role).some((n) => n.href === "/rka/variance")) redirect("/");
  const org = await loadOrg();
  const at = readPeriod(await searchParams);
  const [data, unit] = await Promise.all([loadMonitor(user, org, at), displayUnit()]);
  const started = !!data && at.asOf >= `${data.version.fiscalYear}-01-01`;
  const notes = data
    ? await db
        .select({ note: schema.varianceNote, by: schema.user.name })
        .from(schema.varianceNote)
        .innerJoin(schema.user, eq(schema.user.id, schema.varianceNote.authorId))
        .where(eq(schema.varianceNote.versionId, data.version.id))
        .orderBy(desc(schema.varianceNote.createdAt))
    : [];

  const rowOf = (unitCode: string, coaCode: string | null, label: string, s: { prorata: Money; actual: Money; adjustment: Money }): VarianceRow[] => {
    const actual = s.actual.plus(s.adjustment);
    const v = varianceOf(s.prorata, actual);
    if (!v) return [];
    return [
      {
        unit: unitCode,
        coaCode,
        label,
        budget: formatAmount(s.prorata, unit),
        actual: formatAmount(actual, unit),
        severity: v.severity,
        sentence: v.sentence(label, formatAmount(v.amount.abs(), unit)),
        notes: notes.filter((n) => n.note.unitCode === unitCode && n.note.coaCode === coaCode).map((n) => ({ text: n.note.note, by: n.by, at: when.format(n.note.createdAt) })),
        canNote: canNoteVariance(user.actor, unitCode, org),
      },
    ];
  };
  // Before the year starts nothing is due yet, so there is no variance to explain.
  const rows =
    data && started
      ? data.units.flatMap((u) => [...rowOf(u.unit, null, u.unit, u), ...u.accounts.flatMap((a) => rowOf(u.unit, a.coaCode, `${u.unit} · ${a.coaCode} ${a.coaName}`, a))])
      : [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={data ? `Analisis Varians ${data.version.fiscalYear}` : "Analisis Varians"}
        description={
          data
            ? `Realisasi terhadap anggaran periode, per ${at.asOf}, ${REPORT_PERIOD_LABEL[at.period]}, ${rkaLabel(data.version)}${data.version.status === "locked" ? "" : " (belum dikunci)"}. Watch mulai ±5%, Investigate ±10%, Escalate ±15%.`
            : "Belum ada siklus RKA."
        }
        note={<ViewNote />}
      />
      <PeriodSelector action="/rka/variance" asOf={at.asOf} period={at.period} />
      <Card>
        <CardContent>
          {data && !started ? (
            <p className="text-muted-foreground text-sm">Tahun anggaran {data.version.fiscalYear} belum berjalan pada tanggal itu, jadi belum ada varians.</p>
          ) : (
            <VarianceTable rows={rows} onSave={saveVarianceNote} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
