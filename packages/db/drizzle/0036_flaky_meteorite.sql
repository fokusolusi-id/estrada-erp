CREATE TYPE "public"."cash_entry_kind" AS ENUM('loan_in', 'other_in', 'interest', 'repayment', 'cost', 'other_out');--> statement-breakpoint
CREATE TABLE "cash_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_code" text NOT NULL,
	"on_date" date NOT NULL,
	"kind" "cash_entry_kind" NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"coa_code" text,
	"description" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" text,
	"reversal_reason" text
);
--> statement-breakpoint
ALTER TABLE "cash_entry" ADD CONSTRAINT "cash_entry_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entry" ADD CONSTRAINT "cash_entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entry" ADD CONSTRAINT "cash_entry_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_entry_date_idx" ON "cash_entry" USING btree ("on_date");--> statement-breakpoint
ALTER TABLE "cash_entry" ENABLE ROW LEVEL SECURITY;
