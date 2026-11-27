CREATE TYPE "public"."business_model" AS ENUM('project', 'recurring', 'trading');--> statement-breakpoint
CREATE TYPE "public"."legal_doc_status" AS ENUM('draft', 'circulating', 'done');--> statement-breakpoint
CREATE TYPE "public"."sph_state" AS ENUM('pricing', 'approval', 'approved', 'returned');--> statement-breakpoint
ALTER TYPE "public"."deal_status" ADD VALUE 'PC' BEFORE 'QO';--> statement-breakpoint
ALTER TYPE "public"."deal_status" ADD VALUE 'NG' BEFORE 'WB';--> statement-breakpoint
ALTER TYPE "public"."deal_status" ADD VALUE 'AK' BEFORE 'WB';--> statement-breakpoint
ALTER TYPE "public"."deal_status" ADD VALUE 'DR';--> statement-breakpoint
ALTER TYPE "public"."deal_status" ADD VALUE 'CX';--> statement-breakpoint
CREATE TABLE "sph" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"deal_id" uuid NOT NULL,
	"entity_code" text NOT NULL,
	"issued_on" date NOT NULL,
	"price" numeric(20, 2) NOT NULL,
	"cogs" numeric(20, 2) NOT NULL,
	"description" text NOT NULL,
	"state" "sph_state" DEFAULT 'pricing' NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_role" "role" NOT NULL,
	"created_unit" text NOT NULL,
	"reviewed_by" text,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sph_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD COLUMN "sub_segment" text;--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD COLUMN "business_model" "business_model";--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD COLUMN "product_category" text;--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD COLUMN "pic_sales_nip" text;--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD COLUMN "pic_presales_nip" text;--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD COLUMN "p6_status" "legal_doc_status";--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD COLUMN "p8_status" "legal_doc_status";--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD COLUMN "contract_status" "legal_doc_status";--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD COLUMN "contract_owner" text;--> statement-breakpoint
ALTER TABLE "sph" ADD CONSTRAINT "sph_deal_id_pipeline_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sph" ADD CONSTRAINT "sph_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sph" ADD CONSTRAINT "sph_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sph" ADD CONSTRAINT "sph_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sph" ADD CONSTRAINT "sph_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sph_deal_idx" ON "sph" USING btree ("deal_id");--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD CONSTRAINT "pipeline_deal_pic_sales_nip_employee_nip_fk" FOREIGN KEY ("pic_sales_nip") REFERENCES "public"."employee"("nip") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_deal" ADD CONSTRAINT "pipeline_deal_pic_presales_nip_employee_nip_fk" FOREIGN KEY ("pic_presales_nip") REFERENCES "public"."employee"("nip") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sph" ENABLE ROW LEVEL SECURITY;
