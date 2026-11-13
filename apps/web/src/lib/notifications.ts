import "server-only";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import type { EmailTemplate } from "@estrada/domain";
import type { BellItem } from "@/components/erp/notification-bell";
import { NEEDS_CHANGE, NOTIFICATION_TEXT } from "./notification-text";

const WHEN = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** The header list: this user's latest notifications and how many are still unread. */
export async function loadNotifications(userId: string, limit = 15): Promise<{ items: BellItem[]; unread: number }> {
  const [rows, [unread]] = await Promise.all([
    db.select().from(schema.notification).where(eq(schema.notification.userId, userId)).orderBy(desc(schema.notification.createdAt)).limit(limit),
    db.select({ n: count() }).from(schema.notification).where(and(eq(schema.notification.userId, userId), isNull(schema.notification.readAt))),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      text: NOTIFICATION_TEXT[r.template as EmailTemplate] ?? "Pemberitahuan",
      link: r.link,
      when: WHEN.format(r.createdAt),
      unread: !r.readAt,
      needsChange: NEEDS_CHANGE.has(r.template),
    })),
    unread: unread?.n ?? 0,
  };
}
