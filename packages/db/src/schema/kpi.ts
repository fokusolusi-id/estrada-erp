import { integer, numeric, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { companyEntity } from "./master";

export const kpiStateEnum = pgEnum("kpi_state", ["draft", "submitted", "returned", "approved"]);

const rupiah = (name: string) => numeric(name, { precision: 20, scale: 2 }).notNull();
const percent = (name: string) => numeric(name, { precision: 5, scale: 2 }).notNull();

/**
 * A company's KPI targets for a year (plan D1). The latest approved version is the active one; changing it means a new
 * version through the BOD again (BR-KPI-001).
 */
export const kpiTarget = pgTable(
  "kpi_target",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fiscalYear: integer("fiscal_year").notNull(),
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    version: smallint("version").notNull(),
    revenue: rupiah("revenue"),
    revenueDirect: rupiah("revenue_direct"),
    ebitdaPct: percent("ebitda_pct"),
    cashIn: rupiah("cash_in"),
    netMarginPct: percent("net_margin_pct"),
    state: kpiStateEnum("state").notNull().default("draft"),
    note: text("note"),
    /** The board decision, attached before approval. */
    documentName: text("document_name"),
    documentPath: text("document_path"),
    documentType: text("document_type"),
    submittedBy: text("submitted_by").references(() => user.id),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("kpi_target_version_unique").on(t.fiscalYear, t.entityCode, t.version)],
);
