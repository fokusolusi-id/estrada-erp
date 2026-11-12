import { boolean, date, index, integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { budgetLine } from "./budget";
import { companyEntity, orgUnit, position, roleEnum } from "./master";

export const paymentStateEnum = pgEnum("payment_state", [
  "draft",
  "submitted",
  "returned",
  "under_review",
  "pending_approval",
  "approved",
  "scheduled",
  "paid",
]);
export const paymentKindEnum = pgEnum("payment_kind", ["payment", "cash_advance"]);
/** The documents the flow lists, plus the bank proof Cash Management uploads at Paid. */
export const paymentDocKindEnum = pgEnum("payment_doc_kind", ["invoice", "po", "faktur_pajak", "bast", "delivery_note", "cash_advance", "proof"]);

/** Bank asal: the company accounts Cash Management pays from. */
export const companyBankAccount = pgTable(
  "company_bank_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    bankName: text("bank_name").notNull(),
    accountNumber: text("account_number").notNull(),
    accountName: text("account_name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("company_bank_account_number_idx").on(t.bankName, t.accountNumber)],
);

/** Permintaan Pembayaran. Amounts are numeric(20,2); the nett is derived, never stored. */
export const paymentRequest = pgTable(
  "payment_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** PP/{entity}/{yyyy}/{mm}/{seq}, given when first submitted. */
    number: text("number").unique(),
    kind: paymentKindEnum("kind").notNull().default("payment"),
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    /** "sudah diidentifikasi untuk project / perusahaan mana" */
    project: text("project"),
    budgetLineId: uuid("budget_line_id").references(() => budgetLine.id),
    description: text("description").notNull().default(""),
    payeeName: text("payee_name"),
    payeeBank: text("payee_bank"),
    payeeAccount: text("payee_account"),
    dueOn: date("due_on"),
    gross: numeric("gross", { precision: 20, scale: 2 }).notNull().default("0"),
    ppn: numeric("ppn", { precision: 20, scale: 2 }).notNull().default("0"),
    pph: numeric("pph", { precision: 20, scale: 2 }).notNull().default("0"),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id),
    /** The seat it was made from: its unit and role decide the approvers. */
    requesterPositionId: uuid("requester_position_id").references(() => position.id),
    requesterUnit: text("requester_unit")
      .notNull()
      .references(() => orgUnit.code),
    requesterRole: roleEnum("requester_role").notNull(),
    state: paymentStateEnum("state").notNull().default("draft"),
    scheduledOn: date("scheduled_on"),
    bankAccountId: uuid("bank_account_id").references(() => companyBankAccount.id),
    paidOn: date("paid_on"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_request_state_idx").on(t.state),
    index("payment_request_requester_idx").on(t.requesterId),
    index("payment_request_line_idx").on(t.budgetLineId),
    index("payment_request_paid_idx").on(t.paidOn),
  ],
);

/** Attachments live in private storage; the row keeps where and what. */
export const paymentDocument = pgTable(
  "payment_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => paymentRequest.id, { onDelete: "cascade" }),
    kind: paymentDocKindEnum("kind").notNull(),
    fileName: text("file_name").notNull(),
    storagePath: text("storage_path").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_document_request_idx").on(t.requestId)],
);

/** Every status change, with who did it from which seat and why (a return needs a reason). */
export const paymentEvent = pgTable(
  "payment_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => paymentRequest.id, { onDelete: "cascade" }),
    fromState: paymentStateEnum("from_state").notNull(),
    toState: paymentStateEnum("to_state").notNull(),
    action: text("action").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id),
    actorRole: roleEnum("actor_role").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_event_request_idx").on(t.requestId, t.createdAt)],
);
