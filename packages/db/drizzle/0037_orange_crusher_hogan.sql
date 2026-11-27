ALTER TYPE "public"."payment_state" ADD VALUE 'frm_approval' BEFORE 'approved';--> statement-breakpoint
ALTER TYPE "public"."payment_state" ADD VALUE 'director_approval' BEFORE 'approved';