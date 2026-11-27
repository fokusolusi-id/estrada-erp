CREATE TYPE "public"."coa_normal_balance" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."coa_statement" AS ENUM('income_statement', 'balance_sheet');--> statement-breakpoint
ALTER TYPE "public"."coa_category" ADD VALUE 'TAX';--> statement-breakpoint
ALTER TYPE "public"."coa_category" ADD VALUE 'BALANCE_SHEET';--> statement-breakpoint
CREATE TABLE "coa_segment" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "employee" (
	"nip" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"entity_code" text NOT NULL,
	"unit_code" text,
	"position" text NOT NULL,
	"title" text NOT NULL,
	"function_codes" text[] DEFAULT '{}' NOT NULL,
	"employment_status" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"joined_on" date,
	"manager_nip" text,
	"phone" text,
	"notes" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_email_unique" UNIQUE("email"),
	CONSTRAINT "employee_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "coa_account" ADD COLUMN "level" integer;--> statement-breakpoint
ALTER TABLE "coa_account" ADD COLUMN "account_type" text;--> statement-breakpoint
ALTER TABLE "coa_account" ADD COLUMN "normal_balance" "coa_normal_balance";--> statement-breakpoint
ALTER TABLE "coa_account" ADD COLUMN "statement" "coa_statement";--> statement-breakpoint
ALTER TABLE "coa_account" ADD COLUMN "postable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "coa_account" ADD COLUMN "segmented" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "coa_account" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "coa_account" ADD COLUMN "requestor_units" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "coa_account" ADD COLUMN "owner_units" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_unit_code_org_unit_code_fk" FOREIGN KEY ("unit_code") REFERENCES "public"."org_unit"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coa_segment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee" ENABLE ROW LEVEL SECURITY;
