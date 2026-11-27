import { date, index, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { budgetLine } from "./budget";
import { companyEntity, partner, partnerProduct, roleEnum } from "./master";
import { project } from "./project";

export const prStateEnum = pgEnum("pr_state", ["requested", "approved", "rejected"]);
export const poStateEnum = pgEnum("po_state", ["head", "frm", "director", "approved", "returned", "cancelled"]);

const rupiah = (name: string) => numeric(name, { precision: 20, scale: 2 }).notNull();
const by = (name: string) => text(name).references(() => user.id);
const stamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** A project's request to buy, checked against its RKA line (plan C3; sheet FC05_SCM_Pengadaan). */
export const purchaseRequest = pgTable("purchase_request", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id),
  entityCode: text("entity_code")
    .notNull()
    .references(() => companyEntity.code),
  budgetLineId: uuid("budget_line_id")
    .notNull()
    .references(() => budgetLine.id),
  description: text("description").notNull(),
  estimate: rupiah("estimate"),
  state: prStateEnum("state").notNull().default("requested"),
  note: text("note"),
  createdBy: by("created_by").notNull(),
  /** Its unit's cost center limit decides the PO's approvals. */
  createdUnit: text("created_unit").notNull(),
  decidedBy: by("decided_by"),
  ...stamps,
});

export const purchaseOrder = pgTable(
  "purchase_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NNN/{PT}-PO/MM/YYYY (BR-SCM-001). */
    number: text("number").notNull().unique(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => purchaseRequest.id),
    entityCode: text("entity_code")
      .notNull()
      .references(() => companyEntity.code),
    partnerId: text("partner_id")
      .notNull()
      .references(() => partner.id),
    productId: text("product_id").references(() => partnerProduct.id),
    description: text("description").notNull(),
    qty: numeric("qty", { precision: 14, scale: 2 }).notNull(),
    unitPrice: rupiah("unit_price"),
    amount: rupiah("amount"),
    orderedOn: date("ordered_on").notNull(),
    state: poStateEnum("state").notNull().default("head"),
    note: text("note"),
    createdBy: by("created_by").notNull(),
    createdRole: roleEnum("created_role").notNull(),
    createdUnit: text("created_unit").notNull(),
    ...stamps,
  },
  (t) => [index("purchase_order_request_idx").on(t.requestId)],
);

/** The internal BAST: goods or services received against a PO, in part or whole. */
export const goodsReceipt = pgTable(
  "goods_receipt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => purchaseOrder.id),
    receivedOn: date("received_on").notNull(),
    amount: rupiah("amount"),
    bastNumber: text("bast_number").notNull(),
    note: text("note"),
    createdBy: by("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("goods_receipt_order_idx").on(t.orderId)],
);
