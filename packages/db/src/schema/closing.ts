import { integer, jsonb, numeric, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { companyEntity } from "./master";

const rupiah = (name: string) => numeric(name, { precision: 20, scale: 2 }).notNull();
const entity = () =>
  text("entity_code")
    .notNull()
    .references(() => companyEntity.code);

/** The month-end totals Accounting types (plan B7; client decision 4). */
export const balanceSheet = pgTable(
  "balance_sheet",
  {
    entityCode: entity(),
    year: integer("year").notNull(),
    month: smallint("month").notNull(),
    currentAssets: rupiah("current_assets"),
    totalAssets: rupiah("total_assets"),
    currentLiabilities: rupiah("current_liabilities"),
    totalLiabilities: rupiah("total_liabilities"),
    equity: rupiah("equity"),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.entityCode, t.year, t.month] })],
);

/**
 * The profit and loss and balance sheet as they stood at a closing (BR-RPT-003). A trigger refuses updates and deletes;
 * closing a reopened month again adds a version.
 */
export const pnlSnapshot = pgTable(
  "pnl_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityCode: entity(),
    year: integer("year").notNull(),
    month: smallint("month").notNull(),
    version: smallint("version").notNull(),
    /** Amounts are strings, never JSON numbers. */
    data: jsonb("data").$type<{ lines: { coaCode: string; name: string; category: string; amount: string }[]; balance: Record<string, string> }>().notNull(),
    takenBy: text("taken_by")
      .notNull()
      .references(() => user.id),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pnl_snapshot_version_unique").on(t.entityCode, t.year, t.month, t.version)],
);
