CREATE TYPE "public"."loan_type" AS ENUM('existing', 'new');--> statement-breakpoint
CREATE TABLE "cash_opening" (
	"fiscal_year" integer NOT NULL,
	"entity_code" text NOT NULL,
	"cash" numeric(20, 2) NOT NULL,
	"receivables" numeric(20, 2) NOT NULL,
	"payables" numeric(20, 2) NOT NULL,
	"prior_year_tax" numeric(20, 2) NOT NULL,
	"minimum_cash" numeric(20, 2) NOT NULL,
	CONSTRAINT "cash_opening_fiscal_year_entity_code_pk" PRIMARY KEY("fiscal_year","entity_code")
);
--> statement-breakpoint
CREATE TABLE "cash_setting" (
	"fiscal_year" integer PRIMARY KEY NOT NULL,
	"collection_lag" smallint NOT NULL,
	"cogs_payment_lag" smallint NOT NULL,
	"tax_rate" numeric(6, 4) NOT NULL,
	"minimum_cash" numeric(20, 2) NOT NULL,
	"interest_coa" text[] DEFAULT '{}' NOT NULL,
	"non_cash_coa" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_facility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fiscal_year" integer NOT NULL,
	"name" text NOT NULL,
	"type" "loan_type" NOT NULL,
	"entity_code" text NOT NULL,
	"rate" numeric(7, 6) NOT NULL,
	"opening_balance" numeric(20, 2) NOT NULL,
	"credit_limit" numeric(20, 2),
	"project" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_move" (
	"facility_id" uuid NOT NULL,
	"month" smallint NOT NULL,
	"drawdown" numeric(20, 2) DEFAULT '0' NOT NULL,
	"repayment" numeric(20, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "loan_move_facility_id_month_pk" PRIMARY KEY("facility_id","month")
);
--> statement-breakpoint
ALTER TABLE "cash_opening" ADD CONSTRAINT "cash_opening_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_facility" ADD CONSTRAINT "loan_facility_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_move" ADD CONSTRAINT "loan_move_facility_id_loan_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."loan_facility"("id") ON DELETE cascade ON UPDATE no action;