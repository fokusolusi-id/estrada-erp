import { sql } from "drizzle-orm";
import { date, integer, numeric, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { invoice } from "./invoice";
import { companyEntity } from "./master";
import { paymentRequest } from "./payment";

export const taxKindEnum = pgEnum("tax_kind", ["faktur_out", "faktur_in", "bupot"]);
export const taxStatusEnum = pgEnum("tax_status", ["recorded", "uploaded", "approved", "rejected"]);

/** The number Accounting records for an invoice's or a bill's tax document (plan B6). Amounts stay on the source. */
export const taxDocument = pgTable(
  "tax_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: taxKindEnum("kind").notNull(),
    invoiceId: uuid("invoice_id").references(() => invoice.id),
    paymentId: uuid("payment_id").references(() => paymentRequest.id),
    number: text("number").notNull(),
    documentDate: date("document_date").notNull(),
    status: taxStatusEnum("status").notNull().default("recorded"),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tax_document_invoice_unique").on(t.kind, t.invoiceId).where(sql`${t.invoiceId} is not null`),
    uniqueIndex("tax_document_payment_unique").on(t.kind, t.paymentId).where(sql`${t.paymentId} is not null`),
  ],
);

/** PPh 21 per company per month, typed by Accounting: the app has no payroll (client decision). */
export const taxPph21 = pgTable(
  "tax_pph21",
  {
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    year: integer("year").notNull(),
    month: smallint("month").notNull(),
    amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.entityCode, t.year, t.month] })],
);
