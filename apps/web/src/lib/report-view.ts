import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { REPORT_KIND_LABEL, REPORT_STATE_LABEL, canViewReport, periodLabel, type PeriodType, type ReportKind, type ReportState } from "@estrada/domain";
import type { CurrentUser } from "./session";
import { loadOrg } from "./workflow";

/** One report with its company header and signers, or null when this person may not read it. */
export async function loadReport(user: CurrentUser, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const org = await loadOrg();
  const [row] = await db.select().from(schema.periodicReport).where(eq(schema.periodicReport.id, id));
  if (!row) return null;
  const entities = row.scope.split("+");
  if (!canViewReport(user.actor, { state: row.state as ReportState, entities }, org)) return null;
  const signers = [row.preparedBy, row.reviewedBy, row.approvedBy].filter((x): x is string => !!x);
  const [companies, users] = await Promise.all([
    db.select().from(schema.companyEntity).where(inArray(schema.companyEntity.code, entities)),
    db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(inArray(schema.user.id, signers)),
  ]);
  const name = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "–";
  const single = companies.length === 1 ? companies[0]! : null;
  return {
    row,
    org,
    entities,
    company: single ? single.name : `Konsolidasi ${companies.map((c) => c.name).join(", ")}`,
    contact: single ? [single.address, single.npwp ? `NPWP ${single.npwp}` : null].filter(Boolean).join(" · ") : "",
    title: `${REPORT_KIND_LABEL[row.kind as ReportKind]} ${periodLabel(row.periodType as PeriodType, row.periodNo, row.year)}`,
    status: REPORT_STATE_LABEL[row.state as ReportState],
    approved: row.state === "approved" || row.state === "distributed",
    signatures: [
      ["Disiapkan", name(row.preparedBy), row.generatedAt],
      ["Direview", name(row.reviewedBy), row.reviewedAt],
      ["Disetujui", name(row.approvedBy), row.approvedAt],
    ] as const,
  };
}

export const stamp = (d: Date | null) => (d ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(d) : "–");
