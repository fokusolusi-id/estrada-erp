CREATE TABLE "bod_highlight" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"body" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bod_highlight" ADD CONSTRAINT "bod_highlight_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bod_highlight_uq" ON "bod_highlight" USING btree ("scope","year","month");--> statement-breakpoint
ALTER TABLE "bod_highlight" ENABLE ROW LEVEL SECURITY;
