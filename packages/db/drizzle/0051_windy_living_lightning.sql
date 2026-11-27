CREATE TABLE "early_warning" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"fired_on" date NOT NULL,
	"detail" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"assignees" jsonb NOT NULL,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone,
	"closed_by" text,
	"closed_on" date,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "early_warning" ADD CONSTRAINT "early_warning_acknowledged_by_user_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "early_warning" ADD CONSTRAINT "early_warning_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "early_warning_live_uq" ON "early_warning" USING btree ("rule","subject") WHERE "early_warning"."status" in ('open', 'acknowledged');--> statement-breakpoint
ALTER TABLE "early_warning" ENABLE ROW LEVEL SECURITY;
