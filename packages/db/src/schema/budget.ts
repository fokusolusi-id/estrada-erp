import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { coaAccount, companyEntity, orgUnit, roleEnum } from "./master";

export const versionStatusEnum = pgEnum("budget_version_status", ["open", "locked", "archived"]);
export const approvalStateEnum = pgEnum("approval_state", [
  "draft",
  "consolidation",
  "division_approval",
  "finance_review",
  "awaiting_lock",
  "locked",
]);

/** A version is immutable once locked; a revision copies it. */
export const budgetVersion = pgTable("budget_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  fiscalYear: integer("fiscal_year").notNull(),
  name: text("name").notNull(),
  status: versionStatusEnum("status").notNull().default("open"),
  copiedFromId: uuid("copied_from_id"),
  submissionDeadline: timestamp("submission_deadline", { withTimezone: true }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const budgetLine = pgTable(
  "budget_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => budgetVersion.id, { onDelete: "cascade" }),
    coaCode: text("coa_code")
      .notNull()
      .references(() => coaAccount.code),
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    requestorUnit: text("requestor_unit")
      .notNull()
      .references(() => orgUnit.code),
    ownerUnit: text("owner_unit")
      .notNull()
      .references(() => orgUnit.code),
    item: text("item"),
    project: text("project"),
    basis: text("basis"),
    notes: text("notes"),
    crossDivision: boolean("cross_division").notNull().default(false),
    state: approvalStateEnum("state").notNull().default("draft"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("budget_line_version_idx").on(t.versionId), index("budget_line_owner_idx").on(t.ownerUnit)],
);

/** Months are rows, not 12 columns: budgets, forecasts and actuals share one shape. */
export const budgetLineAmount = pgTable(
  "budget_line_amount",
  {
    lineId: uuid("line_id")
      .notNull()
      .references(() => budgetLine.id, { onDelete: "cascade" }),
    month: smallint("month").notNull(),
    amount: numeric("amount", { precision: 20, scale: 2 }).notNull().default("0"),
  },
  (t) => [primaryKey({ columns: [t.lineId, t.month] })],
);

export const approvalEvent = pgTable("approval_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  lineId: uuid("line_id")
    .notNull()
    .references(() => budgetLine.id, { onDelete: "cascade" }),
  fromState: approvalStateEnum("from_state").notNull(),
  toState: approvalStateEnum("to_state").notNull(),
  action: text("action").notNull(),
  actorUserId: text("actor_user_id")
    .notNull()
    .references(() => user.id),
  actorRole: roleEnum("actor_role").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lineComment = pgTable("line_comment", {
  id: uuid("id").primaryKey().defaultRandom(),
  lineId: uuid("line_id")
    .notNull()
    .references(() => budgetLine.id, { onDelete: "cascade" }),
  authorUserId: text("author_user_id")
    .notNull()
    .references(() => user.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every mutation, login and lockout. */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: text("actor_user_id"),
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailStatusEnum = pgEnum("email_status", ["queued", "sent", "failed"]);

/** Outbox: approvals never wait on the mail server. */
export const emailOutbox = pgTable("email_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  template: text("template").notNull(),
  toUserId: text("to_user_id").references(() => user.id),
  toEmail: text("to_email").notNull(),
  payload: jsonb("payload").notNull(),
  status: emailStatusEnum("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

export const notification = pgTable("notification", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  template: text("template").notNull(),
  link: text("link").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
