import { sql } from "drizzle-orm";
import { boolean, date, index, integer, numeric, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { companyEntity, customer, pphTypeEnum } from "./master";
import { companyBankAccount } from "./payment";
import { pipelineDeal } from "./pipeline";
import { project } from "./project";

export const invoiceStateEnum = pgEnum("invoice_state", ["draft", "validated", "approved", "issued", "cancelled"]);

const rupiah = (name: string) => numeric(name, { precision: 20, scale: 2 }).notNull();

/**
 * One billing termin of a deal with a project, billed (plan B1). The termin is kept by deal and number, since saving
 * a deal rewrites its termin rows; figures are stored as issued.
 */
export const invoice = pgTable(
  "invoice",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** INV/{PT}/{yy}/{seq}, given when issued. */
    number: text("number").unique(),
    state: invoiceStateEnum("state").notNull().default("draft"),
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => pipelineDeal.id),
    terminNo: smallint("termin_no").notNull(),
    description: text("description").notNull(),
    /** The revenue account (4xxx); null only on invoices raised before it was asked (plan B8). */
    revenueCoa: text("revenue_coa"),
    /** Jumlah tagihan termin, before penalty and fine. */
    billed: rupiah("billed"),
    penalty: rupiah("penalty"),
    fine: rupiah("fine"),
    dpp: rupiah("dpp"),
    wapu: boolean("wapu").notNull(),
    ppn: rupiah("ppn"),
    pphType: pphTypeEnum("pph_type").notNull(),
    /** Percent. */
    pphRate: numeric("pph_rate", { precision: 5, scale: 2 }).notNull(),
    pph: rupiah("pph"),
    /** DPP + PPN. */
    total: rupiah("total"),
    /** What is expected from the customer: total less PPh, and less PPN when Wapu. */
    receivable: rupiah("receivable"),
    invoicedOn: date("invoiced_on").notNull(),
    dueOn: date("due_on").notNull(),
    termDays: integer("term_days"),
    bankAccountId: uuid("bank_account_id").references(() => companyBankAccount.id),
    /** The last return or cancellation note. */
    note: text("note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    validatedBy: text("validated_by").references(() => user.id),
    approvedBy: text("approved_by").references(() => user.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoice_state_idx").on(t.state),
    // A termin has one live invoice.
    uniqueIndex("invoice_termin_unique").on(t.dealId, t.terminNo).where(sql`${t.state} <> 'cancelled'`),
  ],
);

/** Money received against an issued invoice (plan B2). A mistake is reversed with a reason, never deleted. */
export const cashReceipt = pgTable(
  "cash_receipt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoice.id),
    receivedOn: date("received_on").notNull(),
    amount: rupiah("amount"),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => companyBankAccount.id),
    /** The bank statement's reference. */
    reference: text("reference").notNull(),
    note: text("note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: text("reversed_by").references(() => user.id),
    reversalReason: text("reversal_reason"),
  },
  (t) => [index("cash_receipt_invoice_idx").on(t.invoiceId)],
);
