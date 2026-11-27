import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const complianceStatusEnum = pgEnum("compliance_status", ["to_implement", "in_progress", "implemented", "future"]);

/** What was recorded against a row of the compliance checklist (plan E8); the rows themselves are in the domain. */
export const complianceRecord = pgTable("compliance_record", {
  code: text("code").primaryKey(),
  status: complianceStatusEnum("status").notNull(),
  evidenceUrl: text("evidence_url"),
  note: text("note"),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => user.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
