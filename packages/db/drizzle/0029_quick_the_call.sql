CREATE TYPE "public"."period_status" AS ENUM('open', 'closing', 'closed');--> statement-breakpoint
CREATE TABLE "fiscal_period" (
	"entity_code" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" "period_status" DEFAULT 'open' NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_period_entity_code_year_month_pk" PRIMARY KEY("entity_code","year","month")
);
--> statement-breakpoint
ALTER TABLE "fiscal_period" ADD CONSTRAINT "fiscal_period_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_period" ADD CONSTRAINT "fiscal_period_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_period" ENABLE ROW LEVEL SECURITY;
