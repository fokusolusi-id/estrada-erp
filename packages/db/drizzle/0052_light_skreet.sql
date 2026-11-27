CREATE SEQUENCE "public"."risk_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "risk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"entity_code" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"likelihood" integer NOT NULL,
	"impact" integer NOT NULL,
	"owner_user_id" text NOT NULL,
	"action_plan" text DEFAULT '' NOT NULL,
	"due_on" date,
	"status" text DEFAULT 'identified' NOT NULL,
	"ew_rule" text,
	"next_review_on" date NOT NULL,
	"created_by" text,
	"decided_by" text,
	"decided_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "risk_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"risk_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"prior_score" integer,
	"new_score" integer,
	"document_name" text,
	"document_path" text,
	"document_type" text,
	"user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_log" ADD CONSTRAINT "risk_log_risk_id_risk_id_fk" FOREIGN KEY ("risk_id") REFERENCES "public"."risk"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_log" ADD CONSTRAINT "risk_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "risk_status_idx" ON "risk" USING btree ("status");--> statement-breakpoint
CREATE INDEX "risk_log_risk_idx" ON "risk_log" USING btree ("risk_id");--> statement-breakpoint
ALTER TABLE "risk" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "risk_log" ENABLE ROW LEVEL SECURITY;
