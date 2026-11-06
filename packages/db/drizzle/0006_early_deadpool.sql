CREATE TYPE "public"."allocation_basis" AS ENUM('revenue', 'headcount', 'fixed');--> statement-breakpoint
CREATE TABLE "entity_headcount" (
	"version_id" uuid NOT NULL,
	"entity_code" text NOT NULL,
	"heads" integer NOT NULL,
	CONSTRAINT "entity_headcount_version_id_entity_code_pk" PRIMARY KEY("version_id","entity_code")
);
--> statement-breakpoint
ALTER TABLE "budget_line" ADD COLUMN "shared_basis" "allocation_basis";--> statement-breakpoint
ALTER TABLE "budget_line" ADD COLUMN "shared_fixed" jsonb;--> statement-breakpoint
ALTER TABLE "entity_headcount" ADD CONSTRAINT "entity_headcount_version_id_budget_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."budget_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_headcount" ADD CONSTRAINT "entity_headcount_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;