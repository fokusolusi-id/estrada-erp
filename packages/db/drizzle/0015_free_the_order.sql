ALTER TABLE "project" ADD COLUMN "rfs_proposed_on" date;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "rfs_proposed_by" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "bast_number" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "bast_proposed_on" date;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "bast_proposed_by" text;--> statement-breakpoint
ALTER TABLE "project_site" ADD COLUMN "spot_check_passed" boolean;--> statement-breakpoint
ALTER TABLE "project_site" ADD COLUMN "bai_number" text;--> statement-breakpoint
ALTER TABLE "project_site" ADD COLUMN "bai_on" date;--> statement-breakpoint
ALTER TABLE "project_site" ADD COLUMN "bai_evidence" text;--> statement-breakpoint
ALTER TABLE "project_site" ADD COLUMN "bai_collected_by" text;--> statement-breakpoint
ALTER TABLE "project_site" ADD COLUMN "bai_collected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_site" ADD COLUMN "bai_compiled_by" text;--> statement-breakpoint
ALTER TABLE "project_site" ADD COLUMN "bai_compiled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_site" ADD COLUMN "bai_verified_by" text;--> statement-breakpoint
ALTER TABLE "project_site" ADD COLUMN "bai_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_site" ADD COLUMN "bai_return_note" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_rfs_proposed_by_user_id_fk" FOREIGN KEY ("rfs_proposed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_bast_proposed_by_user_id_fk" FOREIGN KEY ("bast_proposed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_site" ADD CONSTRAINT "project_site_bai_collected_by_user_id_fk" FOREIGN KEY ("bai_collected_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_site" ADD CONSTRAINT "project_site_bai_compiled_by_user_id_fk" FOREIGN KEY ("bai_compiled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_site" ADD CONSTRAINT "project_site_bai_verified_by_user_id_fk" FOREIGN KEY ("bai_verified_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;