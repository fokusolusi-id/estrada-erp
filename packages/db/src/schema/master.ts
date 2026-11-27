import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  /** From sheet M Perusahaan (BR-MD-001); changes go through approval. */
  npwp: text("npwp"),
  nib: text("nib"),
  address: text("address"),
  /** Kedudukan */
  domicile: text("domicile"),
  phone: text("phone"),
  email: text("email"),
  director: text("director"),
  commissioner: text("commissioner"),
  authorisedCapital: numeric("authorised_capital", { precision: 20, scale: 2 }),
});

export const functionGroupEnum = pgEnum("function_group", ["Revenue", "Delivery", "Support", "Governance"]);

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
  /** The unit is the cost center: what it may approve, and its group (33_Master_CostCenter). */
  approvalLimit: numeric("approval_limit", { precision: 20, scale: 2 }),
  functionGroup: functionGroupEnum("function_group"),
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
  /** Org level 1–4 (BR-MD-002, M Organisasi). */
  level: integer("level"),
  /** F0–F6 (BR-MD-007, 07_Org_Chart). */
  functionCodes: text("function_codes").array().notNull().default([]),
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

/** Master Customer (M Customer, BR-MD-004). NPWP is unique except the placeholder (PLACEHOLDER_NPWP in domain customer.ts). */
export const customer = pgTable(
  "customer",
  {
    id: text("id").primaryKey(),
    nickname: text("nickname").notNull(),
    legalName: text("legal_name").notNull(),
    /** Telco, APH, K/L, Pemda, … (sheet ref). */
    segment: text("segment").notNull(),
    /** Sub-segmen / direktorat. */
    subSegment: text("sub_segment"),
    npwp: text("npwp"),
    address: text("address"),
    email: text("email"),
    phone: text("phone"),
    picName: text("pic_name"),
    picPhone: text("pic_phone"),
    picTitle: text("pic_title"),
    picEmail: text("pic_email"),
    /** Term of payment in days. */
    paymentTermDays: integer("payment_term_days"),
    /** Wajib pungut: the customer collects the PPN itself. */
    wapu: boolean("wapu").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customer_npwp_unique").on(t.npwp).where(sql`${t.npwp} <> '010611200093000'`)],
);

export const partnerCategoryEnum = pgEnum("partner_category", ["Distributor", "Principle"]);

/** Master Mitra (BR-MD-005, BR-SCM-004). An empty NPWP is allowed but warned (domain partnerIssues). */
export const partner = pgTable("partner", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: partnerCategoryEnum("category").notNull(),
  npwp: text("npwp"),
  city: text("city"),
  address: text("address"),
  email: text("email"),
  phone: text("phone"),
  picName: text("pic_name"),
  picPhone: text("pic_phone"),
  picTitle: text("pic_title"),
  picEmail: text("pic_email"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Master Produk Mitra: a partner has many products, each with its own ID (Produk-001, …). */
export const partnerProduct = pgTable(
  "partner_product",
  {
    id: text("id").primaryKey(),
    partnerId: text("partner_id")
      .notNull()
      .references(() => partner.id),
    /** Kategori: Hardware, … */
    category: text("category").notNull(),
    /** Jenis */
    type: text("type").notNull(),
    brand: text("brand").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("partner_product_unique").on(t.partnerId, t.category, t.type, t.brand)],
);

export const changeStatusEnum = pgEnum("master_change_status", ["pending", "approved", "applied", "rejected", "cancelled", "failed"]);

/** A change to a sensitive master (COA, Perusahaan) waiting for the Finance Controller (FC12_Master_Data). */
export const masterChangeRequest = pgTable(
  "master_change_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "coa" or "entity" */
    master: text("master").notNull(),
    subjectId: text("subject_id").notNull(),
    /** create, update, confirm or remap */
    action: text("action").notNull(),
    /** What to write; the record as it was when asked. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    reason: text("reason").notNull(),
    effectiveOn: date("effective_on").notNull(),
    status: changeStatusEnum("status").notNull().default("pending"),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedBy: text("decided_by").references(() => user.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** The rejection note, or why applying failed. */
    note: text("note"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => [index("master_change_request_status_idx").on(t.status), index("master_change_request_subject_idx").on(t.master, t.subjectId)],
);

export const periodStatusEnum = pgEnum("period_status", ["open", "closing", "closed"]);

/** One month of one PT (plan A9). A month with no row is open. */
export const fiscalPeriod = pgTable(
  "fiscal_period",
  {
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    status: periodStatusEnum("status").notNull().default("open"),
    closedBy: text("closed_by").references(() => user.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.entityCode, t.year, t.month] })],
);
