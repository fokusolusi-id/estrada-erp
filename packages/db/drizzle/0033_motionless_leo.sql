CREATE TYPE "public"."invoice_state" AS ENUM('draft', 'validated', 'approved', 'issued', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pph_type" AS ENUM('none', 'pph23', 'pph42', 'pph22');--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"state" "invoice_state" DEFAULT 'draft' NOT NULL,
	"entity_code" text NOT NULL,
	"customer_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"termin_no" smallint NOT NULL,
	"description" text NOT NULL,
	"billed" numeric(20, 2) NOT NULL,
	"penalty" numeric(20, 2) NOT NULL,
	"fine" numeric(20, 2) NOT NULL,
	"dpp" numeric(20, 2) NOT NULL,
	"wapu" boolean NOT NULL,
	"ppn" numeric(20, 2) NOT NULL,
	"pph_type" "pph_type" NOT NULL,
	"pph_rate" numeric(5, 2) NOT NULL,
	"pph" numeric(20, 2) NOT NULL,
	"total" numeric(20, 2) NOT NULL,
	"receivable" numeric(20, 2) NOT NULL,
	"invoiced_on" date NOT NULL,
	"due_on" date NOT NULL,
	"term_days" integer,
	"bank_account_id" uuid,
	"note" text,
	"created_by" text NOT NULL,
	"validated_by" text,
	"approved_by" text,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_deal_id_pipeline_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_bank_account_id_company_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."company_bank_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_validated_by_user_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_state_idx" ON "invoice" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_termin_unique" ON "invoice" USING btree ("deal_id","termin_no") WHERE "invoice"."state" <> 'cancelled';--> statement-breakpoint
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;
