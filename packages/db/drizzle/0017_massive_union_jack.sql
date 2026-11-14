CREATE TYPE "public"."defect_status" AS ENUM('Diajukan', 'Cacat_Bawaan', 'Operasional', 'Diperbaiki', 'Ditutup');--> statement-breakpoint
CREATE TABLE "project_defect" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"site_id" uuid,
	"description" text NOT NULL,
	"status" "defect_status" DEFAULT 'Diajukan' NOT NULL,
	"reported_by" text NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_iso_by" text,
	"confirmed_pmo_by" text,
	"reject_note" text,
	"rejected_by" text,
	"fix_note" text,
	"fixed_by" text,
	"fixed_at" timestamp with time zone,
	"closed_by" text,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "closed_on" date;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "closed_by" text;--> statement-breakpoint
ALTER TABLE "project_defect" ADD CONSTRAINT "project_defect_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_defect" ADD CONSTRAINT "project_defect_site_id_project_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."project_site"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_defect" ADD CONSTRAINT "project_defect_reported_by_user_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_defect" ADD CONSTRAINT "project_defect_confirmed_iso_by_user_id_fk" FOREIGN KEY ("confirmed_iso_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_defect" ADD CONSTRAINT "project_defect_confirmed_pmo_by_user_id_fk" FOREIGN KEY ("confirmed_pmo_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_defect" ADD CONSTRAINT "project_defect_rejected_by_user_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_defect" ADD CONSTRAINT "project_defect_fixed_by_user_id_fk" FOREIGN KEY ("fixed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_defect" ADD CONSTRAINT "project_defect_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_defect_project_idx" ON "project_defect" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_defect" ENABLE ROW LEVEL SECURITY;
