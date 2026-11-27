import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { AUDIT_EVENTS, AUDIT_MODULES, can } from "@estrada/domain";
import { loadAudit, readFilter } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { AuditLogView } from "@/components/erp/audit-log";
import { PageHeader } from "@/components/erp/page-header";
import { Pager } from "@/components/erp/pager";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Audit Log" };

const PER_PAGE = 50;

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const user = await requireUser();
  if (!can(user.actor, "audit.view", null, await loadOrg())) redirect("/");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const filter = readFilter(one);
  const page = Math.max(1, Math.floor(Number(one("hal")) || 1));
  const [{ rows, total }, users] = await Promise.all([
    loadAudit(filter, PER_PAGE, (page - 1) * PER_PAGE),
    db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).orderBy(asc(schema.user.name)),
  ]);
  const query = Object.fromEntries(
    Object.entries({ user: filter.user, modul: filter.module, kode: filter.code, objek: filter.object, dari: filter.from, sampai: filter.to }).filter(([, v]) => v),
  ) as Record<string, string>;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Audit Log" description="Setiap perubahan dan setiap masuk atau keluar, dengan kode kejadian, tingkat dan masa simpan." />
      <Card>
        <CardContent>
          <AuditLogView
            rows={rows}
            query={query}
            users={users}
            modules={[...AUDIT_MODULES]}
            events={AUDIT_EVENTS.map((e) => ({ code: e.code, trigger: e.trigger, severity: e.severity, retentionYears: e.retentionYears, inSheet: e.inSheet }))}
            exportHref={`/audit/export?${new URLSearchParams(query)}`}
          />
          <Pager page={page} pages={Math.ceil(total / PER_PAGE)} total={total} from={(page - 1) * PER_PAGE + 1} to={Math.min(page * PER_PAGE, total)} query={query} />
        </CardContent>
      </Card>
    </div>
  );
}
