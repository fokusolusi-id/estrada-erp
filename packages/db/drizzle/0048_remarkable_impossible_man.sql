CREATE TYPE "public"."kpi_state" AS ENUM('draft', 'submitted', 'returned', 'approved');--> statement-breakpoint
CREATE TABLE "kpi_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fiscal_year" integer NOT NULL,
	"entity_code" text NOT NULL,
	"version" smallint NOT NULL,
	"revenue" numeric(20, 2) NOT NULL,
	"revenue_direct" numeric(20, 2) NOT NULL,
	"ebitda_pct" numeric(5, 2) NOT NULL,
	"cash_in" numeric(20, 2) NOT NULL,
	"net_margin_pct" numeric(5, 2) NOT NULL,
	"state" "kpi_state" DEFAULT 'draft' NOT NULL,
	"note" text,
	"document_name" text,
	"document_path" text,
	"document_type" text,
	"submitted_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kpi_target" ADD CONSTRAINT "kpi_target_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_target" ADD CONSTRAINT "kpi_target_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_target" ADD CONSTRAINT "kpi_target_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_target_version_unique" ON "kpi_target" USING btree ("fiscal_year","entity_code","version");--> statement-breakpoint
ALTER TABLE "kpi_target" ENABLE ROW LEVEL SECURITY;
