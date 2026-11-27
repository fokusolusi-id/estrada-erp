import { date, index, integer, numeric, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { coaAccount, companyEntity, customer, employee, roleEnum } from "./master";

export const dealStatusEnum = pgEnum("deal_status", ["PP", "PT", "PC", "QO", "NG", "AK", "WB", "CW", "DR", "CX"]);
export const legalDocStatusEnum = pgEnum("legal_doc_status", ["draft", "circulating", "done"]);
export const businessModelEnum = pgEnum("business_model", ["project", "recurring", "trading"]);
export const sphStateEnum = pgEnum("sph_state", ["pricing", "approval", "approved", "returned"]);
export const dealTypeEnum = pgEnum("deal_type", ["new", "renewal"]);

/**
 * A deal in BCD's Pipeline register for a fiscal year. It is never part of the RKA: revenue comes from the
 * invoice plan lines, and reports show the weighted pipeline beside it.
 */
export const pipelineDeal = pgTable(
  "pipeline_deal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fiscalYear: integer("fiscal_year").notNull(),
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    /** As typed or imported; follows the master's nickname once a customer is picked. */
    customer: text("customer").notNull(),
    /** BR-SP-002; null until the text is matched to Master Customer. */
    customerId: text("customer_id").references(() => customer.id),
    endCustomer: text("end_customer"),
    segment: text("segment").notNull(),
    project: text("project").notNull(),
    coaCode: text("coa_code").references(() => coaAccount.code),
    /** Excluding PPN. */
    value: numeric("value", { precision: 20, scale: 2 }).notNull(),
    status: dealStatusEnum("status").notNull(),
    /** Percent, 0–100. */
    probability: numeric("probability", { precision: 5, scale: 2 }).notNull(),
    type: dealTypeEnum("type").notNull(),
    startMonth: smallint("start_month").notNull(),
    endMonth: smallint("end_month").notNull(),
    /** Months from the deal's start to PDMS's spend for it. */
    leadTimeMonths: smallint("lead_time_months"),
    notes: text("notes"),
    /** BR-SP-002 fields; PIC are Karyawan. */
    subSegment: text("sub_segment"),
    businessModel: businessModelEnum("business_model"),
    productCategory: text("product_category"),
    picSalesNip: text("pic_sales_nip").references(() => employee.nip),
    picPresalesNip: text("pic_presales_nip").references(() => employee.nip),
    /** P6/BAKN, P8/SPPBJ and contract, in sequence (BR-SP-007). */
    p6Status: legalDocStatusEnum("p6_status"),
    p8Status: legalDocStatusEnum("p8_status"),
    contractStatus: legalDocStatusEnum("contract_status"),
    /** The company holding the contract when it is not ours (BR-SP-006). */
    contractOwner: text("contract_owner"),
    /** Where an imported deal came from, e.g. "Pipeline #12". */
    sourceRef: text("source_ref"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pipeline_deal_year_idx").on(t.fiscalYear)],
);

/** BCD's revenue target per segment for a fiscal year (the Pipeline sheet's legend). */
export const pipelineTarget = pgTable(
  "pipeline_target",
  {
    fiscalYear: integer("fiscal_year").notNull(),
    segment: text("segment").notNull(),
    target: numeric("target", { precision: 20, scale: 2 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.fiscalYear, t.segment] })],
);

/** A planned invoice of a deal. A Closed Won deal has termin for 100% of its value; the invoice plan is their sum. */
export const billingTermin = pgTable(
  "billing_termin",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => pipelineDeal.id, { onDelete: "cascade" }),
    no: smallint("no").notNull(),
    description: text("description"),
    /** Excluding PPN. */
    amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),
    plannedOn: date("planned_on").notNull(),
  },
  (t) => [index("billing_termin_deal_idx").on(t.dealId)],
);

/** The Sales Head's written recovery plan for a segment whose weighted coverage is below 1,0x. */
export const pipelineRecoveryPlan = pgTable(
  "pipeline_recovery_plan",
  {
    fiscalYear: integer("fiscal_year").notNull(),
    segment: text("segment").notNull(),
    plan: text("plan").notNull(),
    updatedBy: text("updated_by").references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.fiscalYear, t.segment] })],
);

/** Surat Penawaran Harga for a deal (plan C1; BR-SP-003). */
export const sph = pgTable(
  "sph",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SPH/{entity}/{yy}/{seq}, per company and year. */
    number: text("number").notNull().unique(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => pipelineDeal.id),
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    issuedOn: date("issued_on").notNull(),
    /** Offered price and its cost, both excluding PPN. */
    price: numeric("price", { precision: 20, scale: 2 }).notNull(),
    cogs: numeric("cogs", { precision: 20, scale: 2 }).notNull(),
    description: text("description").notNull(),
    state: sphStateEnum("state").notNull().default("pricing"),
    /** The last return note. */
    note: text("note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdRole: roleEnum("created_role").notNull(),
    createdUnit: text("created_unit").notNull(),
    reviewedBy: text("reviewed_by").references(() => user.id),
    approvedBy: text("approved_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sph_deal_idx").on(t.dealId)],
);
