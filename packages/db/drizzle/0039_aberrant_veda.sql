CREATE TYPE "public"."tax_kind" AS ENUM('faktur_out', 'faktur_in', 'bupot');--> statement-breakpoint
CREATE TYPE "public"."tax_status" AS ENUM('recorded', 'uploaded', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "tax_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "tax_kind" NOT NULL,
	"invoice_id" uuid,
	"payment_id" uuid,
	"number" text NOT NULL,
	"document_date" date NOT NULL,
	"status" "tax_status" DEFAULT 'recorded' NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_pph21" (
	"entity_code" text NOT NULL,
	"year" integer NOT NULL,
	"month" smallint NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_pph21_entity_code_year_month_pk" PRIMARY KEY("entity_code","year","month")
);
--> statement-breakpoint
ALTER TABLE "tax_document" ADD CONSTRAINT "tax_document_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_document" ADD CONSTRAINT "tax_document_payment_id_payment_request_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_document" ADD CONSTRAINT "tax_document_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_pph21" ADD CONSTRAINT "tax_pph21_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_pph21" ADD CONSTRAINT "tax_pph21_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tax_document_invoice_unique" ON "tax_document" USING btree ("kind","invoice_id") WHERE "tax_document"."invoice_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tax_document_payment_unique" ON "tax_document" USING btree ("kind","payment_id") WHERE "tax_document"."payment_id" is not null;--> statement-breakpoint
ALTER TABLE "tax_document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tax_pph21" ENABLE ROW LEVEL SECURITY;
