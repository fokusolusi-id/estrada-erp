import "server-only";
import { and, count, desc, eq, gte, ilike, inArray, like, lt, or, type SQL } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { auditEvent, auditMatcher, auditResult } from "@estrada/domain";

export interface AuditFilter {
  user?: string;
  module?: string;
  code?: string;
  object?: string;
  /** YYYY-MM-DD, Jakarta days, both included. */
  from?: string;
  to?: string;
}

const day = (value: string | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+07:00`) : null);
const escaped = (s: string) => s.replace(/[\\%_]/g, "\\$&");

function where(f: AuditFilter): SQL | undefined {
  const parts: (SQL | undefined)[] = [];
  if (f.user) parts.push(eq(schema.auditLog.actorUserId, f.user));
  if (f.module || f.code) {
    const m = auditMatcher({ ...(f.module ? { module: f.module } : {}), ...(f.code ? { code: f.code } : {}) });
    const any = [m.exact.length ? inArray(schema.auditLog.action, m.exact) : undefined, ...m.prefixes.map((p) => like(schema.auditLog.action, `${escaped(p)}%`))].filter(Boolean);
    // A module and code that share nothing match no row.
    parts.push(any.length ? or(...any) : eq(schema.auditLog.action, ""));
  }
  if (f.object?.trim()) {
    const q = `%${escaped(f.object.trim())}%`;
    parts.push(or(ilike(schema.auditLog.subjectType, q), ilike(schema.auditLog.subjectId, q)));
  }
  const from = day(f.from);
  const to = day(f.to);
  if (from) parts.push(gte(schema.auditLog.createdAt, from));
  if (to) parts.push(lt(schema.auditLog.createdAt, new Date(to.getTime() + 86_400_000)));
  return and(...parts);
}

export interface AuditRow {
  id: string;
  at: Date;
  user: string;
  code: string;
  module: string;
  severity: string;
  result: "success" | "fail";
  action: string;
  object: string;
  ip: string | null;
  before: unknown;
  after: unknown;
}

export async function loadAudit(filter: AuditFilter, limit: number, offset: number): Promise<{ rows: AuditRow[]; total: number }> {
  const condition = where(filter);
  const [found, [counted]] = await Promise.all([
    db
      .select({ log: schema.auditLog, name: schema.user.name })
      .from(schema.auditLog)
      .leftJoin(schema.user, eq(schema.user.id, schema.auditLog.actorUserId))
      .where(condition)
      .orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(schema.auditLog).where(condition),
  ]);
  return {
    total: counted?.n ?? 0,
    rows: found.map(({ log, name }) => {
      const event = auditEvent(log.action);
      return {
        id: log.id,
        at: log.createdAt,
        user: name ?? (log.actorUserId ? log.actorUserId : "Sistem / tidak dikenal"),
        code: event.code,
        module: event.module,
        severity: event.severity,
        result: auditResult(log.action),
        action: log.action,
        object: [log.subjectType, log.subjectId].filter(Boolean).join(" · "),
        ip: log.ip,
        before: log.before,
        after: log.after,
      };
    }),
  };
}

export const auditTime = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" });

export const readFilter = (get: (key: string) => string | undefined): AuditFilter => {
  const pick = (k: string) => get(k)?.trim() || undefined;
  const f = { user: pick("user"), module: pick("modul"), code: pick("kode"), object: pick("objek"), from: pick("dari"), to: pick("sampai") };
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as AuditFilter;
};
