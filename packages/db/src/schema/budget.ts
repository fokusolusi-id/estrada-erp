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

/** How a shared cost splits across the entities in reports (client decision: all three bases). */
export const allocationBasisEnum = pgEnum("allocation_basis", ["revenue", "headcount", "fixed"]);

/** A version is immutable once locked; a revision copies it. */
export const budgetVersion = pgTable("budget_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  fiscalYear: integer("fiscal_year").notNull(),
  name: text("name").notNull(),
  status: versionStatusEnum("status").notNull().default("open"),
  copiedFromId: uuid("copied_from_id"),
  /** File it was imported from, when it came from a workbook. */
  source: text("source"),
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
    /** Context shown beside the 2027 amounts. */
    rka2026: numeric("rka_2026", { precision: 20, scale: 2 }),
    actual2026: numeric("actual_2026", { precision: 20, scale: 2 }),
    /** Notes for reviewers, e.g. the workbook's cleaning flags. */
    reviewFlags: text("review_flags").array().notNull().default([]),
    /** Where an imported line came from, e.g. "RKA 2027 Data #21 (Finance & Risk Management row 26)". */
    sourceRef: text("source_ref"),
    state: approvalStateEnum("state").notNull().default("draft"),
    /** Set by Finance when the line is a shared cost; reports split it across the entities, the line itself stays. */
    sharedBasis: allocationBasisEnum("shared_basis"),
    /** Percent per entity as typed, for the fixed basis. */
    sharedFixed: jsonb("shared_fixed").$type<Record<string, string>>(),
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

/** Head count per entity that Finance types for a version: the headcount basis for shared costs. */
export const entityHeadcount = pgTable(
  "entity_headcount",
  {
    versionId: uuid("version_id")
      .notNull()
      .references(() => budgetVersion.id, { onDelete: "cascade" }),
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    heads: integer("heads").notNull(),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.entityCode] })],
);

/**
 * A position in a unit's headcount plan. Each one owns a budget line whose months it computes,
 * so the line's amounts stay the single source of rupiah.
 */
export const headcountPlan = pgTable("headcount_plan", {
  lineId: uuid("line_id")
    .primaryKey()
    .references(() => budgetLine.id, { onDelete: "cascade" }),
  position: text("position").notNull(),
  headCount: smallint("head_count").notNull(),
  startMonth: smallint("start_month").notNull(),
  costPerHead: numeric("cost_per_head", { precision: 20, scale: 2 }).notNull(),
});

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

/** Discussion on a line, beside its approval flow: asking never moves the line. */
export const lineComment = pgTable(
  "line_comment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => budgetLine.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id),
    /** The seat the author spoke from, e.g. a pjs acting as Division Owner. */
    authorRole: roleEnum("author_role").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("line_comment_line_idx").on(t.lineId, t.createdAt)],
);

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

/** Reminders already sent, keyed by what they were about, so a daily run never sends the same one twice. */
export const reminderLog = pgTable("reminder_log", {
  key: text("key").primaryKey(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});
