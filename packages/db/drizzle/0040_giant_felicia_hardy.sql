CREATE TABLE "balance_sheet" (
	"entity_code" text NOT NULL,
	"year" integer NOT NULL,
	"month" smallint NOT NULL,
	"current_assets" numeric(20, 2) NOT NULL,
	"total_assets" numeric(20, 2) NOT NULL,
	"current_liabilities" numeric(20, 2) NOT NULL,
	"total_liabilities" numeric(20, 2) NOT NULL,
	"equity" numeric(20, 2) NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balance_sheet_entity_code_year_month_pk" PRIMARY KEY("entity_code","year","month")
);
--> statement-breakpoint
CREATE TABLE "pnl_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_code" text NOT NULL,
	"year" integer NOT NULL,
	"month" smallint NOT NULL,
	"version" smallint NOT NULL,
	"data" jsonb NOT NULL,
	"taken_by" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "balance_sheet" ADD CONSTRAINT "balance_sheet_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_sheet" ADD CONSTRAINT "balance_sheet_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pnl_snapshot" ADD CONSTRAINT "pnl_snapshot_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pnl_snapshot" ADD CONSTRAINT "pnl_snapshot_taken_by_user_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pnl_snapshot_version_unique" ON "pnl_snapshot" USING btree ("entity_code","year","month","version");--> statement-breakpoint
ALTER TABLE "balance_sheet" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pnl_snapshot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE FUNCTION "pnl_snapshot_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'pnl_snapshot is immutable'; END $$;--> statement-breakpoint
CREATE TRIGGER "pnl_snapshot_immutable" BEFORE UPDATE OR DELETE ON "pnl_snapshot" FOR EACH ROW EXECUTE FUNCTION "pnl_snapshot_immutable"();
