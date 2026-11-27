import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  RISK_CATEGORY_LABEL, RISK_STATUS_LABEL, canDecideRisk, canEditRisk, canViewRisk, canWorkRisk, isLiveRisk, riskScore, severityOf, type RiskCategory, type RiskStatus,
} from "@estrada/domain";
import { formatDate } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { PageHeader } from "@/components/erp/page-header";
import { RiskForm, RiskLogForm } from "@/components/erp/risk-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logRisk, saveRisk } from "../actions";

export const metadata: Metadata = { title: "Risiko" };

const AT = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export default async function RiskPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user, org] = await Promise.all([params, requireUser(), loadOrg()]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [r] = await db.select().from(schema.risk).where(eq(schema.risk.id, id));
  if (!r || !canViewRisk(user.actor, { entity: r.entityCode, ownerUserId: r.ownerUserId }, org)) notFound();
  const [log, users, companies] = await Promise.all([
    db.select().from(schema.riskLog).where(eq(schema.riskLog.riskId, id)).orderBy(desc(schema.riskLog.at)),
    db.select({ id: schema.user.id, name: schema.user.name, active: schema.user.active }).from(schema.user).orderBy(asc(schema.user.name)),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
  ]);
  const status = r.status as RiskStatus;
  const subject = { entity: r.entityCode, ownerUserId: r.ownerUserId, likelihood: r.likelihood, impact: r.impact };
  const score = riskScore(r.likelihood, r.impact);
  const name = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "–";
  const live = isLiveRisk(status);
  const statuses = (["in_progress", "mitigated", "closed", "accepted"] as const).filter((s) => s !== status && (s === "closed" || s === "accepted" ? canDecideRisk(user.actor, subject, s, org) : true));
  const options = [{ value: "", label: "Grup" }, ...companies.map((c) => ({ value: c.code, label: c.code }))].filter((o) => canEditRisk(user.actor, { entity: o.value || null }, org));
  const facts: [string, string][] = [
    ["Perusahaan", r.entityCode ?? "Grup"],
    ["Kategori", RISK_CATEGORY_LABEL[r.category as RiskCategory]],
    ["Pemilik", name(r.ownerUserId)],
    ["Skor", `${score} (likelihood ${r.likelihood} × impact ${r.impact}), ${severityOf(score)}`],
    ["Status", RISK_STATUS_LABEL[status] + (r.decidedBy ? ` oleh ${name(r.decidedBy)}, ${formatDate(r.decidedOn!)}` : "")],
    ["Tenggat", r.dueOn ? formatDate(r.dueOn) : "–"],
    ["Review berikutnya", live ? formatDate(r.nextReviewOn) : "–"],
    ["Rencana aksi", r.actionPlan || "–"],
    ["Uraian", r.description || "–"],
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title={`${r.code} ${r.title}`} description={r.ewRule ? `Dari peringatan ${r.ewRule}.` : "Register risiko."} />
      <Link href="/risiko" className="text-sm underline">Kembali ke register</Link>
      <Card>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label}>
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="whitespace-pre-wrap">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      {live && canWorkRisk(user.actor, subject, org) ? (
        <Card>
          <CardHeader><CardTitle>Catat tindakan, review atau status</CardTitle></CardHeader>
          <CardContent>
            <RiskLogForm key={`${r.likelihood}-${r.impact}-${status}`} id={r.id} likelihood={r.likelihood} impact={r.impact} statuses={statuses} onLog={logRisk} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Riwayat</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          {log.map((e) => (
            <div key={e.id} className="border-b pb-2 text-sm">
              <span className="text-muted-foreground block text-xs">
                {AT.format(e.at)} · {name(e.userId)}
                {e.newScore !== null ? ` · skor ${e.priorScore !== null ? `${e.priorScore} → ` : ""}${e.newScore}` : ""}
              </span>
              <span>{e.note || "–"}</span>
              {e.documentPath ? <a href={`/risiko/dokumen/${e.id}`} className="ml-2 underline">{e.documentName}</a> : null}
            </div>
          ))}
        </CardContent>
      </Card>
      {live && canEditRisk(user.actor, subject, org) ? (
        <Card>
          <CardHeader><CardTitle>Ubah risiko</CardTitle></CardHeader>
          <CardContent>
            <RiskForm
              key={r.updatedAt.toISOString()}
              initial={{ id: r.id, entityCode: r.entityCode ?? "", category: r.category, title: r.title, description: r.description, likelihood: r.likelihood, impact: r.impact, ownerUserId: r.ownerUserId, actionPlan: r.actionPlan, dueOn: r.dueOn ?? "" }}
              companies={options}
              owners={users.filter((u) => u.active || u.id === r.ownerUserId)}
              onSave={saveRisk}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
