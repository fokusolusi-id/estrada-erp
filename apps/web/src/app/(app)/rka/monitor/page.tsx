import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { REPORT_PERIOD_LABEL, can, plainMonitor, rkaLabel, unitLabel } from "@estrada/domain";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { displayUnit } from "@/lib/display-unit";
import { loadMonitor, readPeriod } from "@/lib/monitor";
import { todayJakarta } from "@/lib/payment";
import { Adjustments } from "@/components/erp/adjustments";
import { PeriodSelector } from "@/components/erp/period-selector";
import { saveAdjustment } from "./actions";
import { navFor } from "@/lib/nav";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { KpiCard, KpiStrip } from "@/components/erp/kpi-card";
import { PageHeader } from "@/components/erp/page-header";
import { SpendingMonitor } from "@/components/erp/spending-monitor";
import { ViewNote } from "@/components/erp/view-note";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Monitor Anggaran" };

export default async function MonitorPage({ searchParams }: PageProps<"/rka/monitor">) {
  const user = await requireUser();
  const org = await loadOrg();
  if (!navFor(user.actor.role, (u) => org.isWithin(user.actor.orgUnit, u)).some((n) => n.href === "/rka/monitor")) redirect("/");
  const at = readPeriod(await searchParams);
  const [data, unit] = await Promise.all([loadMonitor(user, org, at), displayUnit()]);
  if (!data) {
    return (
      <div className="grid gap-2">
        <h1 className="text-page">Monitor Anggaran</h1>
        <p className="text-muted-foreground text-sm">Belum ada siklus RKA.</p>
      </div>
    );
  }
  const { version, units, total, adjustments } = data;
  const mayAdjust = can(user.actor, "actual.adjust", null, org);
  const [entities, orgUnits, coa, authors] = await Promise.all([
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
    db.select({ code: schema.orgUnit.code }).from(schema.orgUnit).orderBy(asc(schema.orgUnit.code)),
    db.select({ code: schema.coaAccount.code, name: schema.coaAccount.name, category: schema.coaAccount.category }).from(schema.coaAccount).where(eq(schema.coaAccount.postable, true)).orderBy(asc(schema.coaAccount.code)),
    adjustments.length ? db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(inArray(schema.user.id, adjustments.map((a) => a.authorId))) : [],
  ]);
  const author = new Map(authors.map((a) => [a.id, a.name]));
  const covers = (e: string) => user.actor.entities.includes("*") || user.actor.entities.includes(e);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={`Monitor Anggaran ${version.fiscalYear}`}
        description={`Anggaran biaya ${rkaLabel(version)}${version.status === "locked" ? "" : " (belum dikunci)"} terhadap pembayaran dan penyesuaian, per ${at.asOf}, ${REPORT_PERIOD_LABEL[at.period]}. Angka dalam ${unitLabel(unit)}.`}
        note={<ViewNote />}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PeriodSelector action="/rka/monitor" asOf={at.asOf} period={at.period} />
        <Link href={`/rka/variance?per=${at.asOf}&periode=${at.period}`} className="text-primary pb-2 text-sm underline-offset-2 hover:underline">
          Analisis varians dan catatan penyebab
        </Link>
      </div>
      <KpiStrip className="@4xl:grid-cols-5">
        <KpiCard label="Anggaran" value={total.budget} unit={unit} note="Biaya setahun" />
        <KpiCard label="Realisasi periode" value={total.actual.plus(total.adjustment)} unit={unit} note="Dibayar dan disesuaikan" />
        <KpiCard label="Komitmen" value={total.committed} unit={unit} note="Diajukan, belum dibayar" />
        <KpiCard label="Sisa" value={total.remaining} unit={unit} note="Belum terpakai" signal />
        <KpiCard label="Terpakai" value={total.used} unit={unit} note={total.utilisation ? `${total.utilisation.toFixed(1).replace(".", ",")}% dari anggaran` : "—"} />
      </KpiStrip>
      <Card>
        <CardContent>
          <SpendingMonitor units={plainMonitor(units)} unit={unit} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Penyesuaian manual {version.fiscalYear}</CardTitle>
          <CardDescription>Akrual dan koreksi di luar sistem, dicatat Accounting. Pembayaran sudah masuk otomatis; jangan diisi ulang di sini.</CardDescription>
        </CardHeader>
        <CardContent>
          <Adjustments
            rows={adjustments.map((a) => ({ id: a.id, date: a.datedOn, entity: a.entityCode, unit: a.unitCode, coaCode: a.coaCode, kind: a.kind, amount: a.amount, reason: a.reason, by: author.get(a.authorId) ?? "" }))}
            options={
              mayAdjust
                ? {
                    entities: entities.map((e) => e.code).filter(covers),
                    units: orgUnits.map((u) => u.code),
                    coa: coa.filter((c) => c.category === "COGS" || c.category === "OPEX" || c.category === "OTHERS" || c.category === "CAPEX"),
                    today: todayJakarta(),
                  }
                : null
            }
            onSave={saveAdjustment}
          />
        </CardContent>
      </Card>
    </div>
  );
}
