CREATE TYPE "public"."coa_category" AS ENUM('Revenue', 'COGS', 'OPEX', 'OTHERS', 'CAPEX');--> statement-breakpoint
CREATE TYPE "public"."coa_center" AS ENUM('revenue', 'cost');--> statement-breakpoint
CREATE TYPE "public"."entity_cost_type" AS ENUM('direct', 'indirect');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('requestor', 'default_owner', 'division_owner', 'finance', 'director', 'auditor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."org_unit_type" AS ENUM('company', 'division', 'department', 'unit');--> statement-breakpoint
CREATE TYPE "public"."approval_state" AS ENUM('draft', 'consolidation', 'division_approval', 'finance_review', 'awaiting_lock', 'locked');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."budget_version_status" AS ENUM('open', 'locked', 'archived');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_position_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coa_account" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" "coa_category" NOT NULL,
	"center" "coa_center" NOT NULL,
	"default_owner_unit" text,
	"active" boolean DEFAULT true NOT NULL,
	"guidance" text,
	"examples" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_entity" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cost_type" "entity_cost_type" NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_unit" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "org_unit_type" NOT NULL,
	"parent_code" text,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"valid_from" date DEFAULT now() NOT NULL,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "position" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_unit_code" text NOT NULL,
	"title" text NOT NULL,
	"role" "role" NOT NULL,
	"holder_user_id" text,
	"acting_user_id" text
);
--> statement-breakpoint
CREATE TABLE "position_entity_scope" (
	"position_id" uuid NOT NULL,
	"entity_code" text NOT NULL,
	CONSTRAINT "position_entity_scope_position_id_entity_code_pk" PRIMARY KEY("position_id","entity_code")
);
--> statement-breakpoint
CREATE TABLE "approval_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"from_state" "approval_state" NOT NULL,
	"to_state" "approval_state" NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_role" "role" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"coa_code" text NOT NULL,
	"entity_code" text NOT NULL,
	"requestor_unit" text NOT NULL,
	"owner_unit" text NOT NULL,
	"item" text,
	"project" text,
	"basis" text,
	"notes" text,
	"cross_division" boolean DEFAULT false NOT NULL,
	"state" "approval_state" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_line_amount" (
	"line_id" uuid NOT NULL,
	"month" smallint NOT NULL,
	"amount" numeric(20, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "budget_line_amount_line_id_month_pk" PRIMARY KEY("line_id","month")
);
--> statement-breakpoint
CREATE TABLE "budget_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fiscal_year" integer NOT NULL,
	"name" text NOT NULL,
	"status" "budget_version_status" DEFAULT 'open' NOT NULL,
	"copied_from_id" uuid,
	"submission_deadline" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template" text NOT NULL,
	"to_user_id" text,
	"to_email" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "line_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"template" text NOT NULL,
	"link" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coa_account" ADD CONSTRAINT "coa_account_default_owner_unit_org_unit_code_fk" FOREIGN KEY ("default_owner_unit") REFERENCES "public"."org_unit"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_org_unit_code_org_unit_code_fk" FOREIGN KEY ("org_unit_code") REFERENCES "public"."org_unit"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_holder_user_id_user_id_fk" FOREIGN KEY ("holder_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position" ADD CONSTRAINT "position_acting_user_id_user_id_fk" FOREIGN KEY ("acting_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_entity_scope" ADD CONSTRAINT "position_entity_scope_position_id_position_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."position"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_event" ADD CONSTRAINT "approval_event_line_id_budget_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_event" ADD CONSTRAINT "approval_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_version_id_budget_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."budget_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_coa_code_coa_account_code_fk" FOREIGN KEY ("coa_code") REFERENCES "public"."coa_account"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_requestor_unit_org_unit_code_fk" FOREIGN KEY ("requestor_unit") REFERENCES "public"."org_unit"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_owner_unit_org_unit_code_fk" FOREIGN KEY ("owner_unit") REFERENCES "public"."org_unit"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_amount" ADD CONSTRAINT "budget_line_amount_line_id_budget_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_version" ADD CONSTRAINT "budget_version_locked_by_user_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_comment" ADD CONSTRAINT "line_comment_line_id_budget_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_comment" ADD CONSTRAINT "line_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_line_version_idx" ON "budget_line" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "budget_line_owner_idx" ON "budget_line" USING btree ("owner_unit");