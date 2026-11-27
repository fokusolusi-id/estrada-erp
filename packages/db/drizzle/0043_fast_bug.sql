CREATE TYPE "public"."compliance_status" AS ENUM('to_implement', 'in_progress', 'implemented', 'future');--> statement-breakpoint
CREATE TABLE "compliance_record" (
	"code" text PRIMARY KEY NOT NULL,
	"status" "compliance_status" NOT NULL,
	"evidence_url" text,
	"note" text,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compliance_record" ADD CONSTRAINT "compliance_record_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_record" ENABLE ROW LEVEL SECURITY;
