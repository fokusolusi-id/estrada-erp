CREATE TABLE "headcount_plan" (
	"line_id" uuid PRIMARY KEY NOT NULL,
	"position" text NOT NULL,
	"head_count" smallint NOT NULL,
	"start_month" smallint NOT NULL,
	"cost_per_head" numeric(20, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "headcount_plan" ADD CONSTRAINT "headcount_plan_line_id_budget_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_line"("id") ON DELETE cascade ON UPDATE no action;