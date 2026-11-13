import { boolean, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { pipelineDeal } from "./pipeline";

export const projectStatusEnum = pgEnum("project_status", ["Initiation", "Pengadaan_Barang", "Implementasi", "Penagihan", "Layanan", "Garansi", "Closing", "Drop"]);
export const siteStatusEnum = pgEnum("site_status", ["Belum_Mulai", "Survei", "Staging", "Dikirim", "Instalasi", "Uji", "BAI_Terbit", "BAI_Terverifikasi", "Selesai", "Terkendala"]);

/**
 * A delivery project, opened from a Closed Won deal: the deal carries the customer, entity, name (Kode Proyek) and
 * contract value, so none of them is copied here. A deal with a project cannot be deleted.
 */
export const project = pgTable(
  "project",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => pipelineDeal.id, { onDelete: "restrict" }),
    status: projectStatusEnum("status").notNull().default("Initiation"),
    /** jumlah_site_kontrak: the divisor of progress. */
    contractSites: integer("contract_sites").notNull(),
    /** Set when the Head PMO approves the Project Manager's declaration; until then only the proposal is filled. */
    rfsOn: date("rfs_on"),
    rfsProposedOn: date("rfs_proposed_on"),
    rfsProposedBy: text("rfs_proposed_by").references(() => user.id),
    /** Set when the Head PMO approves the BAST the Project Admin prepared. */
    bastOn: date("bast_on"),
    bastNumber: text("bast_number"),
    bastProposedOn: date("bast_proposed_on"),
    bastProposedBy: text("bast_proposed_by").references(() => user.id),
    /** The date responsibility for availability moves to MSO. */
    msoAcceptedOn: date("mso_accepted_on"),
    warrantyEndsOn: date("warranty_ends_on"),
    pmUserId: text("pm_user_id").references(() => user.id),
    deliveryControlUserId: text("delivery_control_user_id").references(() => user.id),
    projectAdminUserId: text("project_admin_user_id").references(() => user.id),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("project_deal_uq").on(t.dealId)],
);

/** A service location of a project: milestones, BAI and evidence are recorded here and summed up to the project. */
export const projectSite = pgTable(
  "project_site",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    /** Unique per project, e.g. POLDA-JATIM-01. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    region: text("region"),
    customerPicName: text("customer_pic_name"),
    customerPicContact: text("customer_pic_contact"),
    status: siteStatusEnum("status").notNull().default("Belum_Mulai"),
    plannedDoneOn: date("planned_done_on").notNull(),
    actualDoneOn: date("actual_done_on"),
    spotCheck: boolean("spot_check").notNull().default(false),
    spotCheckPassed: boolean("spot_check_passed"),
    /** The site's BAI: collected by Delivery Control, compiled by the Project Admin, verified by Assurance. */
    baiNumber: text("bai_number"),
    baiOn: date("bai_on"),
    baiEvidence: text("bai_evidence"),
    baiCollectedBy: text("bai_collected_by").references(() => user.id),
    baiCollectedAt: timestamp("bai_collected_at", { withTimezone: true }),
    baiCompiledBy: text("bai_compiled_by").references(() => user.id),
    baiCompiledAt: timestamp("bai_compiled_at", { withTimezone: true }),
    baiVerifiedBy: text("bai_verified_by").references(() => user.id),
    baiVerifiedAt: timestamp("bai_verified_at", { withTimezone: true }),
    /** Why the last BAI was sent back to be collected again. */
    baiReturnNote: text("bai_return_note"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_site_project_idx").on(t.projectId), uniqueIndex("project_site_code_uq").on(t.projectId, t.code)],
);
