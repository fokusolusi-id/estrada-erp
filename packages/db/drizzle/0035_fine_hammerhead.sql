ALTER TABLE "payment_request" ADD COLUMN "vendor_invoice_no" text;--> statement-breakpoint
ALTER TABLE "payment_request" ADD COLUMN "bill_date" date;--> statement-breakpoint
ALTER TABLE "payment_request" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_request" ADD COLUMN "pph_type" "pph_type";--> statement-breakpoint
ALTER TABLE "payment_request" ADD COLUMN "pph_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "payment_request" ADD CONSTRAINT "payment_request_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_request_vendor_invoice_unique" ON "payment_request" USING btree ("partner_id",lower("vendor_invoice_no")) WHERE "payment_request"."kind" = 'payment';