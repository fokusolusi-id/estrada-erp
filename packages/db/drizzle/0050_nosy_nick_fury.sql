CREATE TABLE "periodic_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"period_type" text NOT NULL,
	"period_no" integer NOT NULL,
	"year" integer NOT NULL,
	"scope" text NOT NULL,
	"version" integer NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"content" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prepared_by" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"distributed_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "periodic_report" ADD CONSTRAINT "periodic_report_prepared_by_user_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodic_report" ADD CONSTRAINT "periodic_report_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periodic_report" ADD CONSTRAINT "periodic_report_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "periodic_report_uq" ON "periodic_report" USING btree ("kind","year","period_type","period_no","scope","version");--> statement-breakpoint
ALTER TABLE "periodic_report" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE FUNCTION "periodic_report_frozen"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('approved', 'distributed') AND (TG_OP = 'DELETE' OR NEW.state <> 'distributed' OR OLD.state <> 'approved'
    OR (to_jsonb(NEW) - 'state' - 'distributed_at') <> (to_jsonb(OLD) - 'state' - 'distributed_at')) THEN
    RAISE EXCEPTION 'approved report is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "periodic_report_frozen" BEFORE UPDATE OR DELETE ON "periodic_report" FOR EACH ROW EXECUTE FUNCTION "periodic_report_frozen"();
