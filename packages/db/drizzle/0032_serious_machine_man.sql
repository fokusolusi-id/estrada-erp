CREATE TYPE "public"."adjustment_kind" AS ENUM('accrual', 'correction');--> statement-breakpoint
CREATE TABLE "actual_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_code" text NOT NULL,
	"unit_code" text NOT NULL,
	"coa_code" text NOT NULL,
	"dated_on" date NOT NULL,
	"kind" "adjustment_kind" NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"reason" text NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actual_adjustment" ADD CONSTRAINT "actual_adjustment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actual_adjustment_date_idx" ON "actual_adjustment" USING btree ("dated_on");--> statement-breakpoint
ALTER TABLE "actual_adjustment" ENABLE ROW LEVEL SECURITY;
