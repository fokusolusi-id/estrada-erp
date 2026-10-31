CREATE TABLE "coa_reference" (
	"code" text NOT NULL,
	"entity_group" text NOT NULL,
	"rka_2026" numeric(20, 2),
	"actual_ytd" numeric(20, 2),
	"forecast_q4" numeric(20, 2),
	CONSTRAINT "coa_reference_code_entity_group_pk" PRIMARY KEY("code","entity_group")
);
--> statement-breakpoint
ALTER TABLE "coa_account" ADD COLUMN "provisional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_line" ADD COLUMN "rka_2026" numeric(20, 2);--> statement-breakpoint
ALTER TABLE "budget_line" ADD COLUMN "actual_2026" numeric(20, 2);--> statement-breakpoint
ALTER TABLE "budget_line" ADD COLUMN "review_flags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_line" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "budget_version" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "coa_reference" ADD CONSTRAINT "coa_reference_code_coa_account_code_fk" FOREIGN KEY ("code") REFERENCES "public"."coa_account"("code") ON DELETE cascade ON UPDATE no action;