CREATE TYPE "public"."handover_status" AS ENUM('Disusun', 'Diajukan', 'Dikembalikan', 'Diterima_MSO', 'Diterima_ISO', 'Selesai');--> statement-breakpoint
CREATE TABLE "handover_artefact" (
	"project_id" uuid NOT NULL,
	"no" smallint NOT NULL,
	"reference" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handover_artefact_project_id_no_pk" PRIMARY KEY("project_id","no")
);
--> statement-breakpoint
CREATE TABLE "project_handover" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"status" "handover_status" DEFAULT 'Disusun' NOT NULL,
	"has_application" boolean DEFAULT false NOT NULL,
	"submitted_by" text,
	"submitted_at" timestamp with time zone,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checklist_by" text,
	"mso_accepted_by" text,
	"iso_accepted_by" text,
	"iso_accepted_at" timestamp with time zone,
	"return_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handover_artefact" ADD CONSTRAINT "handover_artefact_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handover_artefact" ADD CONSTRAINT "handover_artefact_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_handover" ADD CONSTRAINT "project_handover_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_handover" ADD CONSTRAINT "project_handover_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_handover" ADD CONSTRAINT "project_handover_checklist_by_user_id_fk" FOREIGN KEY ("checklist_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_handover" ADD CONSTRAINT "project_handover_mso_accepted_by_user_id_fk" FOREIGN KEY ("mso_accepted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_handover" ADD CONSTRAINT "project_handover_iso_accepted_by_user_id_fk" FOREIGN KEY ("iso_accepted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_handover" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "handover_artefact" ENABLE ROW LEVEL SECURITY;
