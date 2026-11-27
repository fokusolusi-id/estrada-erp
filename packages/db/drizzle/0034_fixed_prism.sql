CREATE TABLE "cash_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"received_on" date NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" text,
	"reversal_reason" text
);
--> statement-breakpoint
ALTER TABLE "cash_receipt" ADD CONSTRAINT "cash_receipt_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_receipt" ADD CONSTRAINT "cash_receipt_bank_account_id_company_bank_account_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."company_bank_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_receipt" ADD CONSTRAINT "cash_receipt_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_receipt" ADD CONSTRAINT "cash_receipt_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_receipt_invoice_idx" ON "cash_receipt" USING btree ("invoice_id");--> statement-breakpoint
ALTER TABLE "cash_receipt" ENABLE ROW LEVEL SECURITY;
