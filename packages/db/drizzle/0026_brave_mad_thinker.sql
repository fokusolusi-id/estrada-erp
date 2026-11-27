CREATE TYPE "public"."master_change_status" AS ENUM('pending', 'approved', 'applied', 'rejected', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "master_change_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"master" text NOT NULL,
	"subject_id" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"before" jsonb,
	"reason" text NOT NULL,
	"effective_on" date NOT NULL,
	"status" "master_change_status" DEFAULT 'pending' NOT NULL,
	"requester_id" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"note" text,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "master_change_request" ADD CONSTRAINT "master_change_request_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_change_request" ADD CONSTRAINT "master_change_request_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "master_change_request_status_idx" ON "master_change_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "master_change_request_subject_idx" ON "master_change_request" USING btree ("master","subject_id");--> statement-breakpoint
ALTER TABLE "master_change_request" ENABLE ROW LEVEL SECURITY;
