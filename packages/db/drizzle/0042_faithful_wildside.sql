CREATE TABLE "scenario_setting" (
	"fiscal_year" integer PRIMARY KEY NOT NULL,
	"scenarios" jsonb NOT NULL,
	"seasonality" text[] NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenario_setting" ADD CONSTRAINT "scenario_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_setting" ENABLE ROW LEVEL SECURITY;
