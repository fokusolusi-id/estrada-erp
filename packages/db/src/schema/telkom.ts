import { boolean, date, index, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { project } from "./project";

const forProject = () =>
  uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" });
const by = (name: string) =>
  text(name)
    .notNull()
    .references(() => user.id);
const at = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

/** A project followed through the Telkom billing stages (plan C4). */
export const billingTrack = pgTable("billing_track", {
  projectId: forProject().primaryKey(),
  startedOn: date("started_on").notNull(),
  startedBy: by("started_by"),
});

/** A stage done (or not applicable), with its evidence. */
export const billingStage = pgTable(
  "billing_stage",
  {
    projectId: forProject(),
    stage: smallint("stage").notNull(),
    doneOn: date("done_on").notNull(),
    notApplicable: boolean("not_applicable").notNull().default(false),
    note: text("note"),
    documentName: text("document_name"),
    documentPath: text("document_path"),
    documentType: text("document_type"),
    doneBy: by("done_by"),
    createdAt: at("created_at"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.stage] })],
);

/** Each tier reached while a stage was late (BR-PNG-004). Kept after the stage is done. */
export const billingEscalation = pgTable(
  "billing_escalation",
  {
    projectId: forProject(),
    stage: smallint("stage").notNull(),
    tier: smallint("tier").notNull(),
    deadline: date("deadline").notNull(),
    createdAt: at("created_at"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.stage, t.tier] })],
);

/** What blocks a project's billing and why (BR-PNG-006). */
export const billingObstacle = pgTable(
  "billing_obstacle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: forProject(),
    stage: smallint("stage").notNull(),
    issue: text("issue").notNull(),
    cause: text("cause").notNull(),
    lastUpdate: text("last_update"),
    resolvedOn: date("resolved_on"),
    createdBy: by("created_by"),
    createdAt: at("created_at"),
    updatedAt: at("updated_at"),
  },
  (t) => [index("billing_obstacle_project_idx").on(t.projectId)],
);

export const assuranceAreaEnum = pgEnum("assurance_area", ["obl_govsol", "obl_pss", "legal", "gspo", "asc", "pia", "finance"]);

/** A project's standing in a JPMB assurance area (BR-PNG-002). */
export const billingAssurance = pgTable(
  "billing_assurance",
  {
    projectId: forProject(),
    area: assuranceAreaEnum("area").notNull(),
    done: boolean("done").notNull(),
    updatedBy: by("updated_by"),
    updatedAt: at("updated_at"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.area] })],
);
