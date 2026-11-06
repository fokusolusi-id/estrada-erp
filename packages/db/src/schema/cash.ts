import { integer, numeric, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companyEntity } from "./master";

/** The year's cash rules (Forecast CF Bulanan's ASUMSI block); the forecast itself is always computed. */
export const cashSetting = pgTable("cash_setting", {
  fiscalYear: integer("fiscal_year").primaryKey(),
  collectionLag: smallint("collection_lag").notNull(),
  cogsPaymentLag: smallint("cogs_payment_lag").notNull(),
  /** PPh Badan as a fraction, e.g. 0.22. */
  taxRate: numeric("tax_rate", { precision: 6, scale: 4 }).notNull(),
  /** The group's minimum cash, for the consolidated funding need. */
  minimumCash: numeric("minimum_cash", { precision: 20, scale: 2 }).notNull(),
  /** RKA interest COAs replaced by Obligo interest. */
  interestCoa: text("interest_coa").array().notNull().default([]),
  /** Depreciation and amortisation COAs, kept out of cash. */
  nonCashCoa: text("non_cash_coa").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Each entity's balance-sheet position on 1 January and its own cash buffer. */
export const cashOpening = pgTable(
  "cash_opening",
  {
    fiscalYear: integer("fiscal_year").notNull(),
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    cash: numeric("cash", { precision: 20, scale: 2 }).notNull(),
    receivables: numeric("receivables", { precision: 20, scale: 2 }).notNull(),
    payables: numeric("payables", { precision: 20, scale: 2 }).notNull(),
    priorYearTax: numeric("prior_year_tax", { precision: 20, scale: 2 }).notNull(),
    minimumCash: numeric("minimum_cash", { precision: 20, scale: 2 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.fiscalYear, t.entityCode] })],
);

export const loanTypeEnum = pgEnum("loan_type", ["existing", "new"]);

/** A bank facility in Obligo Pinjaman Bank. */
export const loanFacility = pgTable("loan_facility", {
  id: uuid("id").primaryKey().defaultRandom(),
  fiscalYear: integer("fiscal_year").notNull(),
  name: text("name").notNull(),
  type: loanTypeEnum("type").notNull(),
  entityCode: text("entity_code")
    .notNull()
    .references(() => companyEntity.code),
  /** Yearly, as a fraction, e.g. 0.1. */
  rate: numeric("rate", { precision: 7, scale: 6 }).notNull(),
  openingBalance: numeric("opening_balance", { precision: 20, scale: 2 }).notNull(),
  creditLimit: numeric("credit_limit", { precision: 20, scale: 2 }),
  project: text("project"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Principal drawn or repaid on a facility in a month. */
export const loanMove = pgTable(
  "loan_move",
  {
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => loanFacility.id, { onDelete: "cascade" }),
    month: smallint("month").notNull(),
    drawdown: numeric("drawdown", { precision: 20, scale: 2 }).notNull().default("0"),
    repayment: numeric("repayment", { precision: 20, scale: 2 }).notNull().default("0"),
  },
  (t) => [primaryKey({ columns: [t.facilityId, t.month] })],
);
