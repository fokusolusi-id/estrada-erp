import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  RISK_CATEGORIES, RISK_CATEGORY_LABEL, RISK_STATUS_LABEL, canEditRisk, canViewRisk, heatmap, isLiveRisk, riskScore, severityOf, type RiskCategory, type RiskSeverity, type RiskStatus,
} from "@estrada/domain";
import { formatDate } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { RiskForm } from "@/components/erp/risk-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveRisk } from "./actions";

export const metadata: Metadata = { title: "Register Risiko" };

const TONE: Record<RiskSeverity, string> = { critical: "bg-destructive text-white", high: "bg-state-finance/80 text-black", medium: "bg-state-finance/30 text-foreground", low: "bg-muted text-foreground" };
const SEVERITIES: RiskSeverity[] = ["critical", "high", "medium", "low"];

export default async function RisksPage({ searchParams }: { searchParams: Promise<{ l?: string; i?: string; kategori?: string; semua?: string }> }) {
  const user = await requireUser();
  if (user.actor.role === "admin") redirect("/");
  const org = await loadOrg();
  const asked = await searchParams;
  const [rows, users, companies] = await Promise.all([
    db.select().from(schema.risk).orderBy(asc(schema.risk.code)),
    db.select({ id: schema.user.id, name: schema.user.name, active: schema.user.active }).from(schema.user).orderBy(asc(schema.user.name)),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
  ]);
  const mine = rows.filter((r) => canViewRisk(user.actor, { entity: r.entityCode, ownerUserId: r.ownerUserId }, org)).map((r) => ({ ...r, status: r.status as RiskStatus, score: riskScore(r.likelihood, r.impact) }));
  const cell = heatmap(mine);
  const [l, i] = [Number(asked.l) || null, Number(asked.i) || null];
  const category = RISK_CATEGORIES.find((c) => c === asked.kategori) ?? null;
  const shown = mine.filter((r) => (asked.semua ? true : isLiveRisk(r.status)) && (!l || r.likelihood === l) && (!i || r.impact === i) && (!category || r.category === category)).sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  const live = mine.filter((r) => isLiveRisk(r.status));
  const name = (id: string) => users.find((u) => u.id === id)?.name ?? "–";
  const options = [{ value: "", label: "Grup" }, ...companies.map((c) => ({ value: c.code, label: c.code }))].filter((o) => canEditRisk(user.actor, { entity: o.value || null }, org));
  const counts = SEVERITIES.map((s) => `${live.filter((r) => severityOf(r.score) === s).length} ${s.replace(/^./, (c) => c.toUpperCase())}`).join(" · ");
  const average = live.length ? (live.reduce((n, r) => n + r.score, 0) / live.length).toFixed(1).replace(".", ",") : "–";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Register Risiko" description={`${live.length} risiko berjalan: ${counts}. Skor rata-rata ${average}.`} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Heatmap</CardTitle>
            <CardDescription>Jumlah risiko berjalan per likelihood (baris) dan impact (kolom). Klik kotak untuk menyaring.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid max-w-md grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1 text-center text-sm">
              {[5, 4, 3, 2, 1].map((row) => (
                <div key={row} className="contents">
                  <span className="text-muted-foreground self-center pr-2 text-xs">L{row}</span>
                  {[1, 2, 3, 4, 5].map((col) => (
                    <Link key={col} href={`/risiko?l=${row}&i=${col}`} aria-label={`Likelihood ${row}, impact ${col}: ${cell(row, col)} risiko`} className={`tabular rounded py-3 ${TONE[severityOf(row * col)]} ${l === row && i === col ? "ring-foreground ring-2" : ""}`}>
                      {cell(row, col) || ""}
                    </Link>
                  ))}
                </div>
              ))}
              <span />
              {[1, 2, 3, 4, 5].map((col) => <span key={col} className="text-muted-foreground text-xs">I{col}</span>)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Per kategori</CardTitle>
            <CardDescription>Risiko berjalan dan jumlah skornya.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {RISK_CATEGORIES.map((c: RiskCategory) => {
              const here = live.filter((r) => r.category === c);
              return (
                <Link key={c} href={`/risiko?kategori=${c}`} className="flex justify-between border-b py-1 hover:underline">
                  <span>{RISK_CATEGORY_LABEL[c]}</span>
                  <span className="tabular">{here.length} · skor {here.reduce((n, r) => n + r.score, 0)}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={!l && !category && !asked.semua ? "default" : "outline"}><Link href="/risiko">Berjalan</Link></Button>
        <Button asChild size="sm" variant={asked.semua ? "default" : "outline"}><Link href="/risiko?semua=1">Semua</Link></Button>
      </div>
      <Card>
        <CardContent className="grid gap-2">
          {shown.length ? (
            shown.map((r) => (
              <div key={r.id} data-testid="risk-row" className="flex flex-wrap items-start justify-between gap-2 border-b pb-2 text-sm">
                <span>
                  <Link href={`/risiko/${r.id}`} className="font-medium underline">{r.code} {r.title}</Link>
                  <span className="text-muted-foreground block text-xs">
                    {r.entityCode ?? "Grup"} · {RISK_CATEGORY_LABEL[r.category as RiskCategory]} · {name(r.ownerUserId)}
                    {r.dueOn ? ` · tenggat ${formatDate(r.dueOn)}` : ""} · review {formatDate(r.nextReviewOn)}
                  </span>
                </span>
                <span className="flex gap-1">
                  <Badge className={`border-transparent ${TONE[severityOf(r.score)]}`}>{r.score}</Badge>
                  <Badge variant="outline">{RISK_STATUS_LABEL[r.status]}</Badge>
                </span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">Belum ada risiko.</p>
          )}
        </CardContent>
      </Card>
      {options.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Tambah risiko</CardTitle>
          </CardHeader>
          <CardContent>
            <RiskForm initial={{ id: "", entityCode: options[0]!.value, category: "financial", title: "", description: "", likelihood: 3, impact: 3, ownerUserId: "", actionPlan: "", dueOn: "" }} companies={options} owners={users.filter((u) => u.active)} onSave={saveRisk} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
