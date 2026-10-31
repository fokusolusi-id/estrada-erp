import { boolean, date, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const categoryEnum = pgEnum("coa_category", ["Revenue", "COGS", "OPEX", "OTHERS", "CAPEX"]);
export const centerEnum = pgEnum("coa_center", ["revenue", "cost"]);
export const costTypeEnum = pgEnum("entity_cost_type", ["direct", "indirect"]);
export const unitTypeEnum = pgEnum("org_unit_type", ["company", "division", "department", "unit"]);
export const roleEnum = pgEnum("role", [
  "requestor",
  "default_owner",
  "division_owner",
  "finance",
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
  active: boolean("active").notNull().default(true),
  guidance: text("guidance"),
  examples: text("examples"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
