import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** The BOD's monthly highlights, per company or for the companies shown together (plan D3; 18_Dashboard_Spec_BOD W-FT). */
export const bodHighlight = pgTable(
  "bod_highlight",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Entity codes joined with "+". */
    scope: text("scope").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    body: text("body").notNull(),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("bod_highlight_uq").on(t.scope, t.year, t.month)],
);
