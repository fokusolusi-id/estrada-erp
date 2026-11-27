import { date, index, integer, pgSequence, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { companyEntity } from "./master";

export const riskCodeSeq = pgSequence("risk_code_seq");

/** The risk register (plan D6; P3-M3). A risk is never deleted: it is closed with evidence, or accepted. */
export const risk = pgTable(
  "risk",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    /** Null for a risk of the whole group. */
    entityCode: text("entity_code").references(() => companyEntity.code),
    category: text("category").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    likelihood: integer("likelihood").notNull(),
    impact: integer("impact").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id),
    actionPlan: text("action_plan").notNull().default(""),
    dueOn: date("due_on"),
    status: text("status").notNull().default("identified"),
    /** The early warning rule that opened it, when one did. */
    ewRule: text("ew_rule"),
    nextReviewOn: date("next_review_on").notNull(),
    createdBy: text("created_by").references(() => user.id),
    decidedBy: text("decided_by").references(() => user.id),
    decidedOn: date("decided_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("risk_status_idx").on(t.status)],
);

/** What was done, reviewed or decided on a risk, with its evidence. */
export const riskLog = pgTable(
  "risk_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    riskId: uuid("risk_id")
      .notNull()
      .references(() => risk.id),
    kind: text("kind").notNull(),
    note: text("note").notNull().default(""),
    priorScore: integer("prior_score"),
    newScore: integer("new_score"),
    documentName: text("document_name"),
    documentPath: text("document_path"),
    documentType: text("document_type"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("risk_log_risk_idx").on(t.riskId)],
);
