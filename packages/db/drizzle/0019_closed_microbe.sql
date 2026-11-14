CREATE TABLE "project_planning_item" (
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"reference" text NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_planning_item_project_id_key_pk" PRIMARY KEY("project_id","key")
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "kickoff_gate_on" date;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "kickoff_gate_by" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "baseline_on" date;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "baseline_by" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "rfs_target_on" date;--> statement-breakpoint
ALTER TABLE "project_planning_item" ADD CONSTRAINT "project_planning_item_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_planning_item" ADD CONSTRAINT "project_planning_item_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_kickoff_gate_by_user_id_fk" FOREIGN KEY ("kickoff_gate_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_baseline_by_user_id_fk" FOREIGN KEY ("baseline_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_planning_item" ENABLE ROW LEVEL SECURITY;
