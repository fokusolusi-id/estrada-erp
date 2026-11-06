import { index, integer, numeric, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { coaAccount, companyEntity } from "./master";

export const dealStatusEnum = pgEnum("deal_status", ["PP", "PT", "QO", "WB"]);
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
    customer: text("customer").notNull(),
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
    notes: text("notes"),
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
