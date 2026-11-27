CREATE TYPE "public"."assurance_area" AS ENUM('obl_govsol', 'obl_pss', 'legal', 'gspo', 'asc', 'pia', 'finance');--> statement-breakpoint
CREATE TABLE "billing_assurance" (
	"project_id" uuid NOT NULL,
	"area" "assurance_area" NOT NULL,
	"done" boolean NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_assurance_project_id_area_pk" PRIMARY KEY("project_id","area")
);
--> statement-breakpoint
CREATE TABLE "billing_escalation" (
	"project_id" uuid NOT NULL,
	"stage" smallint NOT NULL,
	"tier" smallint NOT NULL,
	"deadline" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_escalation_project_id_stage_tier_pk" PRIMARY KEY("project_id","stage","tier")
);
--> statement-breakpoint
CREATE TABLE "billing_obstacle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"stage" smallint NOT NULL,
	"issue" text NOT NULL,
	"cause" text NOT NULL,
	"last_update" text,
	"resolved_on" date,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_stage" (
	"project_id" uuid NOT NULL,
	"stage" smallint NOT NULL,
	"done_on" date NOT NULL,
	"not_applicable" boolean DEFAULT false NOT NULL,
	"note" text,
	"document_name" text,
	"document_path" text,
	"document_type" text,
	"done_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_stage_project_id_stage_pk" PRIMARY KEY("project_id","stage")
);
--> statement-breakpoint
CREATE TABLE "billing_track" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"started_on" date NOT NULL,
	"started_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_assurance" ADD CONSTRAINT "billing_assurance_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_assurance" ADD CONSTRAINT "billing_assurance_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_escalation" ADD CONSTRAINT "billing_escalation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_obstacle" ADD CONSTRAINT "billing_obstacle_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_obstacle" ADD CONSTRAINT "billing_obstacle_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_stage" ADD CONSTRAINT "billing_stage_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_stage" ADD CONSTRAINT "billing_stage_done_by_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_track" ADD CONSTRAINT "billing_track_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_track" ADD CONSTRAINT "billing_track_started_by_user_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_obstacle_project_idx" ON "billing_obstacle" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "billing_track" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_stage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_escalation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_obstacle" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_assurance" ENABLE ROW LEVEL SECURITY;
