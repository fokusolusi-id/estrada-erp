import { sql } from "drizzle-orm";
import { boolean, date, index, numeric, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { companyEntity } from "./master";
import { project } from "./project";

/*
 * The bank facilities actually held (plan B5; sheets FC08_Obligo_Bank, 14_Obligo_Status_Apr2026). The year's planned
 * loans on Arus Kas (loan_facility) are a forecast and stay separate.
 */
export const facilityTypeEnum = pgEnum("facility_type", ["bg", "kmk", "ki", "trade_line"]);
export const drawingKindEnum = pgEnum("drawing_kind", ["loan", "bg"]);
export const bgTypeEnum = pgEnum("bg_type", ["bid", "performance", "maintenance", "advance"]);
export const drawingStateEnum = pgEnum("drawing_state", ["requested", "issued", "rejected", "released"]);

const rupiah = (name: string) => numeric(name, { precision: 20, scale: 2 }).notNull();
const by = (name: string) => text(name).references(() => user.id);

export const bankFacility = pgTable(
  "bank_facility",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bankName: text("bank_name").notNull(),
    name: text("name").notNull(),
    type: facilityTypeEnum("type").notNull(),
    /** Null when the facility is not one company's: each drawing then names it. */
    entityCode: text("entity_code").references(() => companyEntity.code),
    plafon: rupiah("plafon"),
    expiresOn: date("expires_on"),
    contractNo: text("contract_no"),
    /** Day of the month interest is due. */
    interestDay: smallint("interest_day"),
    escrowAccount: text("escrow_account"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("bank_facility_unique").on(t.bankName, t.name, sql`coalesce(${t.entityCode}, '')`)],
);

export const facilityDrawing = pgTable(
  "facility_drawing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => bankFacility.id),
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    kind: drawingKindEnum("kind").notNull(),
    bgType: bgTypeEnum("bg_type"),
    projectId: uuid("project_id").references(() => project.id),
    /** The contract or KL behind it, and its file. */
    underlying: text("underlying").notNull(),
    documentName: text("document_name"),
    documentPath: text("document_path"),
    documentType: text("document_type"),
    amount: rupiah("amount"),
    state: drawingStateEnum("state").notNull().default("requested"),
    /** The bank's guarantee or credit agreement number. */
    reference: text("reference"),
    issuedOn: date("issued_on"),
    dueOn: date("due_on"),
    /** Outstanding when the register started: no cash moved through the app. */
    opening: boolean("opening").notNull().default(false),
    requestedBy: by("requested_by"),
    decidedBy: by("decided_by"),
    note: text("note"),
    releaseConfirmedBy: by("release_confirmed_by"),
    releaseConfirmedAt: timestamp("release_confirmed_at", { withTimezone: true }),
    releasedOn: date("released_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("facility_drawing_facility_idx").on(t.facilityId, t.state)],
);

/** Principal and interest paid on a facility. A mistake is reversed with a reason, never deleted. */
export const facilityPayment = pgTable(
  "facility_payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facilityId: uuid("facility_id")
      .notNull()
      .references(() => bankFacility.id),
    drawingId: uuid("drawing_id").references(() => facilityDrawing.id),
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    paidOn: date("paid_on").notNull(),
    principal: rupiah("principal"),
    interest: rupiah("interest"),
    reference: text("reference").notNull(),
    createdBy: by("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: by("reversed_by"),
    reversalReason: text("reversal_reason"),
  },
  (t) => [index("facility_payment_facility_idx").on(t.facilityId, t.paidOn)],
);
