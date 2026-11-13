ALTER TYPE "public"."deal_status" ADD VALUE 'CW';--> statement-breakpoint
CREATE TABLE "billing_termin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"no" smallint NOT NULL,
	"description" text,
	"amount" numeric(20, 2) NOT NULL,
	"planned_on" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_recovery_plan" (
	"fiscal_year" integer NOT NULL,
	"segment" text NOT NULL,
	"plan" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_recovery_plan_fiscal_year_segment_pk" PRIMARY KEY("fiscal_year","segment")
);
--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD COLUMN "lead_time_months" smallint;--> statement-breakpoint
ALTER TABLE "billing_termin" ADD CONSTRAINT "billing_termin_deal_id_pipeline_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_recovery_plan" ADD CONSTRAINT "pipeline_recovery_plan_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_termin_deal_idx" ON "billing_termin" USING btree ("deal_id");--> statement-breakpoint
ALTER TABLE "billing_termin" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pipeline_recovery_plan" ENABLE ROW LEVEL SECURITY;
