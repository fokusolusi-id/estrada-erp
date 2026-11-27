CREATE TYPE "public"."bg_type" AS ENUM('bid', 'performance', 'maintenance', 'advance');--> statement-breakpoint
CREATE TYPE "public"."drawing_kind" AS ENUM('loan', 'bg');--> statement-breakpoint
CREATE TYPE "public"."drawing_state" AS ENUM('requested', 'issued', 'rejected', 'released');--> statement-breakpoint
CREATE TYPE "public"."facility_type" AS ENUM('bg', 'kmk', 'ki', 'trade_line');--> statement-breakpoint
CREATE TABLE "bank_facility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_name" text NOT NULL,
	"name" text NOT NULL,
	"type" "facility_type" NOT NULL,
	"entity_code" text,
	"plafon" numeric(20, 2) NOT NULL,
	"expires_on" date,
	"contract_no" text,
	"interest_day" smallint,
	"escrow_account" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facility_drawing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"entity_code" text NOT NULL,
	"kind" "drawing_kind" NOT NULL,
	"bg_type" "bg_type",
	"project_id" uuid,
	"underlying" text NOT NULL,
	"document_name" text,
	"document_path" text,
	"document_type" text,
	"amount" numeric(20, 2) NOT NULL,
	"state" "drawing_state" DEFAULT 'requested' NOT NULL,
	"reference" text,
	"issued_on" date,
	"due_on" date,
	"opening" boolean DEFAULT false NOT NULL,
	"requested_by" text,
	"decided_by" text,
	"note" text,
	"release_confirmed_by" text,
	"release_confirmed_at" timestamp with time zone,
	"released_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facility_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"drawing_id" uuid,
	"entity_code" text NOT NULL,
	"paid_on" date NOT NULL,
	"principal" numeric(20, 2) NOT NULL,
	"interest" numeric(20, 2) NOT NULL,
	"reference" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" text,
	"reversal_reason" text
);
--> statement-breakpoint
ALTER TABLE "bank_facility" ADD CONSTRAINT "bank_facility_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_drawing" ADD CONSTRAINT "facility_drawing_facility_id_bank_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."bank_facility"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_drawing" ADD CONSTRAINT "facility_drawing_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_drawing" ADD CONSTRAINT "facility_drawing_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_drawing" ADD CONSTRAINT "facility_drawing_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_drawing" ADD CONSTRAINT "facility_drawing_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_drawing" ADD CONSTRAINT "facility_drawing_release_confirmed_by_user_id_fk" FOREIGN KEY ("release_confirmed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_payment" ADD CONSTRAINT "facility_payment_facility_id_bank_facility_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."bank_facility"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_payment" ADD CONSTRAINT "facility_payment_drawing_id_facility_drawing_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."facility_drawing"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_payment" ADD CONSTRAINT "facility_payment_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_payment" ADD CONSTRAINT "facility_payment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_payment" ADD CONSTRAINT "facility_payment_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_facility_unique" ON "bank_facility" USING btree ("bank_name","name",coalesce("entity_code", ''));--> statement-breakpoint
CREATE INDEX "facility_drawing_facility_idx" ON "facility_drawing" USING btree ("facility_id","state");--> statement-breakpoint
CREATE INDEX "facility_payment_facility_idx" ON "facility_payment" USING btree ("facility_id","paid_on");--> statement-breakpoint
ALTER TABLE "bank_facility" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "facility_drawing" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "facility_payment" ENABLE ROW LEVEL SECURITY;
