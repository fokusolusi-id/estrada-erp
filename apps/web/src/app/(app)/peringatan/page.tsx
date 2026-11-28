import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { ACK_DAYS, ALERT_STATUS_LABEL, EW_RULES, SEVERITY_LABEL, canActOnAlert, canRunCheck, canViewAlert, evaluateRules, ewRule, unjudgedRules, type AlertStatus, type Severity } from "@estrada/domain";
import { loadEwFigures } from "@/lib/early-warning-figures";
import { formatDate, todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { AlertActions, CheckWarningsButton } from "@/components/erp/alert-forms";
import { PageHeader } from "@/components/erp/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkWarnings, runAlertAction } from "./actions";

export const metadata: Metadata = { title: "Peringatan Dini" };

const TONE: Record<Severity, string> = { critical: "bg-destructive text-white", high: "bg-state-finance/80 text-black", medium: "bg-muted text-foreground", low: "bg-muted text-muted-foreground" };
const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default async function WarningsPage() {
  const user = await requireUser();
  if (user.actor.role === "admin") redirect("/");
  const org = await loadOrg();
  const [rows, users, figures] = await Promise.all([
    db.select().from(schema.earlyWarning).orderBy(desc(schema.earlyWarning.firedOn)),
    db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user),
    loadEwFigures(todayJakarta(), org),
  ]);
  // Only which rules lack data is shown here, never the figures behind them.
  const unjudged = unjudgedRules(evaluateRules(figures));
  const mine = rows.filter((r) => ewRule(r.rule) && canViewAlert(user.actor, r, org));
  const open = mine.filter((r) => r.status === "open" || r.status === "acknowledged").sort((a, b) => RANK[ewRule(a.rule)!.severity] - RANK[ewRule(b.rule)!.severity] || a.rule.localeCompare(b.rule));
  const closed = mine.filter((r) => !open.includes(r)).slice(0, 50);
  const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? "–";
  // Days from firing to closing, over what people resolved.
  const resolveDays = (code: string) => {
    const done = mine.filter((r) => r.rule === code && r.status === "resolved" && r.closedOn);
    return done.length ? (done.reduce((n, r) => n + (Date.parse(r.closedOn!) - Date.parse(r.firedOn)) / 86_400_000, 0) / done.length).toFixed(1).replace(".", ",") : "–";
  };
  const title = (r: (typeof rows)[number]) => `${r.rule}${r.subject ? ` · ${r.subject}` : ""} · ${ewRule(r.rule)!.name}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Peringatan Dini"
        description={`Diperiksa setiap hari. Belum diterima dalam ${ACK_DAYS.critical}/${ACK_DAYS.high}/${ACK_DAYS.medium}/${ACK_DAYS.low} hari (Critical/High/Medium/Low) naik ke Head FRM, lalu ke Direktur.`}
      />
      {canRunCheck(user.actor, org) ? <CheckWarningsButton onCheck={checkWarnings} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>Terbuka ({open.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {open.length ? (
            open.map((r) => {
              const rule = ewRule(r.rule)!;
              return (
                <div key={r.id} data-testid="alert" className="grid gap-1 border-b pb-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    <Badge className={`border-transparent ${TONE[rule.severity]}`}>{SEVERITY_LABEL[rule.severity]}</Badge>
                    {title(r)}
                    {r.level ? <Badge variant="outline">Eskalasi level {r.level}</Badge> : null}
                  </span>
                  <span>
                    {r.detail}. <Link href={rule.link} className="underline">Buka sumber</Link>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Sejak {formatDate(r.firedOn)} · {ALERT_STATUS_LABEL[r.status as AlertStatus]}
                    {r.acknowledgedBy ? ` oleh ${name(r.acknowledgedBy)}` : ""} · {rule.action}
                  </span>
                  {canActOnAlert(user.actor, r, org) ? <AlertActions id={r.id} acknowledged={r.status === "acknowledged"} onAction={runAlertAction} /> : null}
                </div>
              );
            })
          ) : (
            <p className="text-muted-foreground text-sm">
              Tidak ada peringatan terbuka.{unjudged.length ? ` ${unjudged.length} dari ${EW_RULES.length} aturan belum bisa dinilai karena datanya belum ada.` : ""}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sudah ditutup</CardTitle>
          <CardDescription>50 terakhir.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {closed.length ? (
            closed.map((r) => (
              <div key={r.id} className="grid border-b pb-2 text-sm">
                <span>{title(r)}</span>
                <span className="text-muted-foreground text-xs">
                  {ALERT_STATUS_LABEL[r.status as AlertStatus]}
                  {r.closedOn ? ` ${formatDate(r.closedOn)}` : ""}
                  {r.closedBy ? ` oleh ${name(r.closedBy)}` : ""}
                  {r.note ? ` · ${r.note}` : ""}
                </span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">Belum ada.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Daftar aturan</CardTitle>
          <CardDescription>
            EW-01 dinilai dari kas yang sudah dicatat, bukan proyeksi Arus Kas. EW-07 dan EW-10 belum dinilai: margin kontrak dan target konversi belum dicatat.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {["Kode", "Aturan", "Tingkat", "Data", "Rata-rata selesai (hari)"].map((h) => (
                  <th key={h} className="text-muted-foreground py-1 pr-3 text-left text-xs font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EW_RULES.map((rule) => (
                <tr key={rule.code} className="border-t">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{rule.code}</td>
                  <td className="pr-3">{rule.name}</td>
                  <td className="pr-3">{SEVERITY_LABEL[rule.severity]}</td>
                  <td className={`pr-3 whitespace-nowrap ${unjudged.includes(rule.code) ? "font-medium" : "text-muted-foreground"}`}>{unjudged.includes(rule.code) ? "Belum ada data" : "Dinilai"}</td>
                  <td className="tabular">{resolveDays(rule.code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
