CREATE TABLE "variance_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"unit_code" text NOT NULL,
	"coa_code" text,
	"note" text NOT NULL,
	"author_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "variance_note" ADD CONSTRAINT "variance_note_version_id_budget_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."budget_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variance_note" ADD CONSTRAINT "variance_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "variance_note_version_idx" ON "variance_note" USING btree ("version_id","unit_code");--> statement-breakpoint
ALTER TABLE "variance_note" ENABLE ROW LEVEL SECURITY;
