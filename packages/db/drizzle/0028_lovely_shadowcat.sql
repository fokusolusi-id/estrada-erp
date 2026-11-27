CREATE TYPE "public"."function_group" AS ENUM('Revenue', 'Delivery', 'Support', 'Governance');--> statement-breakpoint
ALTER TABLE "org_unit" ADD COLUMN "approval_limit" numeric(20, 2);--> statement-breakpoint
ALTER TABLE "org_unit" ADD COLUMN "function_group" "function_group";--> statement-breakpoint
ALTER TABLE "position" ADD COLUMN "level" integer;--> statement-breakpoint
ALTER TABLE "position" ADD COLUMN "function_codes" text[] DEFAULT '{}' NOT NULL;