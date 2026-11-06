CREATE TYPE "public"."deal_status" AS ENUM('PP', 'PT', 'QO', 'WB');--> statement-breakpoint
CREATE TYPE "public"."deal_type" AS ENUM('new', 'renewal');--> statement-breakpoint
CREATE TABLE "pipeline_deal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fiscal_year" integer NOT NULL,
	"entity_code" text NOT NULL,
	"customer" text NOT NULL,
	"end_customer" text,
	"segment" text NOT NULL,
	"project" text NOT NULL,
	"coa_code" text,
	"value" numeric(20, 2) NOT NULL,
	"status" "deal_status" NOT NULL,
	"probability" numeric(5, 2) NOT NULL,
	"type" "deal_type" NOT NULL,
	"start_month" smallint NOT NULL,
	"end_month" smallint NOT NULL,
	"notes" text,
	"source_ref" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_target" (
	"fiscal_year" integer NOT NULL,
	"segment" text NOT NULL,
	"target" numeric(20, 2) NOT NULL,
	CONSTRAINT "pipeline_target_fiscal_year_segment_pk" PRIMARY KEY("fiscal_year","segment")
);
--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD CONSTRAINT "pipeline_deal_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD CONSTRAINT "pipeline_deal_coa_code_coa_account_code_fk" FOREIGN KEY ("coa_code") REFERENCES "public"."coa_account"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD CONSTRAINT "pipeline_deal_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_deal_year_idx" ON "pipeline_deal" USING btree ("fiscal_year");