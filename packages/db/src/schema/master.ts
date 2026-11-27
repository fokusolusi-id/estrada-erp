import { boolean, date, integer, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** RKA budgets the first five; TAX and BALANCE_SHEET complete the ledger from COA Structured RKA 2027. */
export const categoryEnum = pgEnum("coa_category", ["Revenue", "COGS", "OPEX", "OTHERS", "CAPEX", "TAX", "BALANCE_SHEET"]);
export const normalBalanceEnum = pgEnum("coa_normal_balance", ["debit", "credit"]);
export const statementEnum = pgEnum("coa_statement", ["income_statement", "balance_sheet"]);
export const centerEnum = pgEnum("coa_center", ["revenue", "cost"]);
export const costTypeEnum = pgEnum("entity_cost_type", ["direct", "indirect"]);
export const unitTypeEnum = pgEnum("org_unit_type", ["company", "division", "department", "unit"]);
export const roleEnum = pgEnum("role", [
  "requestor",
  "default_owner",
  "division_owner",
  "finance",
  "bfp",
  "cash_manager",
  "director",
  "auditor",
  "admin",
]);

/** ESTRADA, MATRIK, DJALU, PAS (Mapping Entitas B). */
export const companyEntity = pgTable("company_entity", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  costType: costTypeEnum("cost_type").notNull(),
  active: boolean("active").notNull().default(true),
});

/** FRM, HCM, PDMS, PMO, SCM, ISO, MSO, BCD, PST (Mapping Entitas A + org chart). */
export const orgUnit = pgTable("org_unit", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  type: unitTypeEnum("type").notNull(),
  parentCode: text("parent_code"),
  /** Old names kept for import matching, e.g. SPA → BCD, BSD → PST. */
  aliases: text("aliases").array().notNull().default([]),
  validFrom: date("valid_from").notNull().defaultNow(),
  validTo: date("valid_to"),
});

export const position = pgTable("position", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgUnitCode: text("org_unit_code")
    .notNull()
    .references(() => orgUnit.code),
  title: text("title").notNull(),
  role: roleEnum("role").notNull(),
  /** null = vacant */
  holderUserId: text("holder_user_id").references(() => user.id),
  /** pjs */
  actingUserId: text("acting_user_id").references(() => user.id),
  /** The person the org chart document names for this seat, until they have an account. */
  holderName: text("holder_name"),
});

/** Entities a position may see; '*' for all. */
export const positionEntityScope = pgTable(
  "position_entity_scope",
  {
    positionId: uuid("position_id")
      .notNull()
      .references(() => position.id, { onDelete: "cascade" }),
    entityCode: text("entity_code").notNull(),
  },
  (t) => [primaryKey({ columns: [t.positionId, t.entityCode] })],
);

/** COA Master. Owned by Finance (CARA PENGISIAN point 6). */
export const coaAccount = pgTable("coa_account", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  category: categoryEnum("category").notNull(),
  center: centerEnum("center").notNull(),
  defaultOwnerUnit: text("default_owner_unit").references(() => orgUnit.code),
  /** Tree set by Finance, e.g. 5500 over 5510 and 5520; same category as the child. */
  parentCode: text("parent_code").references((): AnyPgColumn => coaAccount.code, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  /** Used in the workbook but missing from COA Master: Finance confirms or remaps it. */
  provisional: boolean("provisional").notNull().default(false),
  guidance: text("guidance"),
  examples: text("examples"),
  /** From COA Structured RKA 2027; null on codes the workbook added that the structured COA lacks. */
  level: integer("level"),
  /** Current Asset, Operating Expense, Contra Asset, … as Finance writes it. */
  accountType: text("account_type"),
  normalBalance: normalBalanceEnum("normal_balance"),
  statement: statementEnum("statement"),
  /** Parent accounts take no postings. */
  postable: boolean("postable").notNull().default(true),
  /** Takes a segment suffix -S1..-S4 (coa_segment). */
  segmented: boolean("segmented").notNull().default(false),
  note: text("note"),
  /** Units that may request and own this code; defaultOwnerUnit is the first owner. */
  requestorUnits: text("requestor_units").array().notNull().default([]),
  ownerUnits: text("owner_units").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Segment suffixes for segmented COA codes: S1 Government/APH .. S4 Telco. */
export const coaSegment = pgTable("coa_segment", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});

/** COA Master's 2026 figures per entity group: the sheet lists most codes once per group. Reference only. */
export const coaReference = pgTable(
  "coa_reference",
  {
    code: text("code")
      .notNull()
      .references(() => coaAccount.code, { onDelete: "cascade" }),
    entityGroup: text("entity_group").notNull(),
    rka2026: numeric("rka_2026", { precision: 20, scale: 2 }),
    actualYtd: numeric("actual_ytd", { precision: 20, scale: 2 }),
    forecastQ4: numeric("forecast_q4", { precision: 20, scale: 2 }),
  },
  (t) => [primaryKey({ columns: [t.code, t.entityGroup] })],
);

/**
 * Master Karyawan (Data Karyawan, later synced from HRMS). Not a login: Admin still invites users,
 * and an account links to its employee by email.
 */
export const employee = pgTable("employee", {
  nip: text("nip").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  entityCode: text("entity_code")
    .notNull()
    .references(() => companyEntity.code),
  /** The department when known, else the division. */
  unitCode: text("unit_code").references(() => orgUnit.code),
  /** Posisi: Head, Leader, Staff, … */
  position: text("position").notNull(),
  /** Jabatan */
  title: text("title").notNull(),
  /** Kode fungsi F0..F12 */
  functionCodes: text("function_codes").array().notNull().default([]),
  employmentStatus: text("employment_status").notNull(),
  active: boolean("active").notNull().default(true),
  joinedOn: date("joined_on"),
  managerNip: text("manager_nip"),
  phone: text("phone"),
  notes: text("notes"),
  userId: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
