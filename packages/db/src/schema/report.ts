import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** A report's tables as generated: text cells, and money cells as `{ m: "…" }`. */
export interface ReportContent {
  sheets: { name: string; columns: string[]; rows: (string | { m: string })[][] }[];
}

/**
 * Periodic reports (plan D4; FC09). The figures are stored when generated; once approved a trigger keeps them
 * from changing or being deleted (BR-RPT-003).
 */
export const periodicReport = pgTable(
  "periodic_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    periodType: text("period_type").notNull(),
    periodNo: integer("period_no").notNull(),
    year: integer("year").notNull(),
    /** Entity codes joined with "+". */
    scope: text("scope").notNull(),
    version: integer("version").notNull(),
    state: text("state").notNull().default("draft"),
    content: jsonb("content").$type<ReportContent>().notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    preparedBy: text("prepared_by")
      .notNull()
      .references(() => user.id),
    reviewedBy: text("reviewed_by").references(() => user.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    distributedAt: timestamp("distributed_at", { withTimezone: true }),
    note: text("note"),
  },
  (t) => [uniqueIndex("periodic_report_uq").on(t.kind, t.year, t.periodType, t.periodNo, t.scope, t.version)],
);
