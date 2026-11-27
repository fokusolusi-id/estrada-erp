import { sql } from "drizzle-orm";
import { date, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** One early warning: a rule that fired, who holds it and how it was closed (plan D5; P3-M4 EW_Event). */
export const earlyWarning = pgTable(
  "early_warning",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rule: text("rule").notNull(),
    /** The division or unit for rules judged per one, else empty. */
    subject: text("subject").notNull().default(""),
    firedOn: date("fired_on").notNull(),
    detail: text("detail").notNull(),
    status: text("status").notNull().default("open"),
    level: integer("level").notNull().default(0),
    assignees: jsonb("assignees").$type<string[]>().notNull(),
    acknowledgedBy: text("acknowledged_by").references(() => user.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    closedBy: text("closed_by").references(() => user.id),
    closedOn: date("closed_on"),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One live alert per rule and subject.
  (t) => [uniqueIndex("early_warning_live_uq").on(t.rule, t.subject).where(sql`${t.status} in ('open', 'acknowledged')`)],
);
