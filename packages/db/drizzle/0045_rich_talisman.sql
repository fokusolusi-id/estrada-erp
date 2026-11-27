CREATE TYPE "public"."payment_term" AS ENUM('lumpsum', 'turnkey', 'termin');--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "p8_received_on" date;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "contract_no" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "contract_date" date;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "contract_duration" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "payment_term" "payment_term";--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "pic_legal_nip" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "pic_scm_nip" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "pic_pm_nip" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "pic_ops_nip" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "pic_hrd_nip" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "pic_finance_nip" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_pic_legal_nip_employee_nip_fk" FOREIGN KEY ("pic_legal_nip") REFERENCES "public"."employee"("nip") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_pic_scm_nip_employee_nip_fk" FOREIGN KEY ("pic_scm_nip") REFERENCES "public"."employee"("nip") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_pic_pm_nip_employee_nip_fk" FOREIGN KEY ("pic_pm_nip") REFERENCES "public"."employee"("nip") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_pic_ops_nip_employee_nip_fk" FOREIGN KEY ("pic_ops_nip") REFERENCES "public"."employee"("nip") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_pic_hrd_nip_employee_nip_fk" FOREIGN KEY ("pic_hrd_nip") REFERENCES "public"."employee"("nip") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_pic_finance_nip_employee_nip_fk" FOREIGN KEY ("pic_finance_nip") REFERENCES "public"."employee"("nip") ON DELETE no action ON UPDATE no action;