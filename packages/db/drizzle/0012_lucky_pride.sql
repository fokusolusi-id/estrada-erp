CREATE TYPE "public"."payment_doc_kind" AS ENUM('invoice', 'po', 'faktur_pajak', 'bast', 'delivery_note', 'cash_advance', 'proof');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('payment', 'cash_advance');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('draft', 'submitted', 'returned', 'under_review', 'pending_approval', 'approved', 'scheduled', 'paid');--> statement-breakpoint
CREATE TABLE "company_bank_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" "payment_doc_kind" NOT NULL,
	"file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"from_state" "payment_state" NOT NULL,
	"to_state" "payment_state" NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_role" "role" NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"kind" "payment_kind" DEFAULT 'payment' NOT NULL,
	"entity_code" text NOT NULL,
	"project" text,
	"budget_line_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"payee_name" text,
	"payee_bank" text,
	"payee_account" text,
	"due_on" date,
	"gross" numeric(20, 2) DEFAULT '0' NOT NULL,
	"ppn" numeric(20, 2) DEFAULT '0' NOT NULL,
	"pph" numeric(20, 2) DEFAULT '0' NOT NULL,
	"requester_id" text NOT NULL,
	"requester_position_id" uuid,
	"requester_unit" text NOT NULL,
	"requester_role" "role" NOT NULL,
	"state" "payment_state" DEFAULT 'draft' NOT NULL,
	"scheduled_on" date,
	"bank_account_id" uuid,
	"paid_on" date,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_request_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "company_bank_account" ADD CONSTRAINT "company_bank_account_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_document" ADD CONSTRAINT "payment_document_request_id_payment_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."payment_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_document" ADD CONSTRAINT "payment_document_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_request_id_payment_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."payment_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request" ADD CONSTRAINT "payment_request_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request" ADD CONSTRAINT "payment_request_budget_line_id_budget_line_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."budget_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request" ADD CONSTRAINT "payment_request_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request" ADD CONSTRAINT "payment_request_requester_position_id_position_id_fk" FOREIGN KEY ("requester_position_id") REFERENCES "public"."position"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request" ADD CONSTRAINT "payment_request_requester_unit_org_unit_code_fk" FOREIGN KEY ("requester_unit") REFERENCES "public"."org_unit"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request" ADD CONSTRAINT "payment_request_bank_account_id_company_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."company_bank_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_bank_account_number_idx" ON "company_bank_account" USING btree ("bank_name","account_number");--> statement-breakpoint
CREATE INDEX "payment_document_request_idx" ON "payment_document" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "payment_event_request_idx" ON "payment_event" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_request_state_idx" ON "payment_request" USING btree ("state");--> statement-breakpoint
CREATE INDEX "payment_request_requester_idx" ON "payment_request" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "payment_request_line_idx" ON "payment_request" USING btree ("budget_line_id");--> statement-breakpoint
CREATE INDEX "payment_request_paid_idx" ON "payment_request" USING btree ("paid_on");--> statement-breakpoint
ALTER TABLE "company_bank_account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_request" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_event" ENABLE ROW LEVEL SECURITY;
