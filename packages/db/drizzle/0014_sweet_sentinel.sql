CREATE TYPE "public"."project_status" AS ENUM('Initiation', 'Pengadaan_Barang', 'Implementasi', 'Penagihan', 'Layanan', 'Garansi', 'Closing', 'Drop');--> statement-breakpoint
CREATE TYPE "public"."site_status" AS ENUM('Belum_Mulai', 'Survei', 'Staging', 'Dikirim', 'Instalasi', 'Uji', 'BAI_Terbit', 'BAI_Terverifikasi', 'Selesai', 'Terkendala');--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"status" "project_status" DEFAULT 'Initiation' NOT NULL,
	"contract_sites" integer NOT NULL,
	"rfs_on" date,
	"bast_on" date,
	"mso_accepted_on" date,
	"warranty_ends_on" date,
	"pm_user_id" text,
	"delivery_control_user_id" text,
	"project_admin_user_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"region" text,
	"customer_pic_name" text,
	"customer_pic_contact" text,
	"status" "site_status" DEFAULT 'Belum_Mulai' NOT NULL,
	"planned_done_on" date NOT NULL,
	"actual_done_on" date,
	"spot_check" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_deal_id_pipeline_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_pm_user_id_user_id_fk" FOREIGN KEY ("pm_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_delivery_control_user_id_user_id_fk" FOREIGN KEY ("delivery_control_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_project_admin_user_id_user_id_fk" FOREIGN KEY ("project_admin_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_site" ADD CONSTRAINT "project_site_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_site" ADD CONSTRAINT "project_site_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_deal_uq" ON "project" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "project_site_project_idx" ON "project_site" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_site_code_uq" ON "project_site" USING btree ("project_id","code");--> statement-breakpoint
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_site" ENABLE ROW LEVEL SECURITY;
