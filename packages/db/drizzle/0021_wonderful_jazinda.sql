CREATE TABLE "customer" (
	"id" text PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"legal_name" text NOT NULL,
	"segment" text NOT NULL,
	"sub_segment" text,
	"npwp" text,
	"address" text,
	"email" text,
	"phone" text,
	"pic_name" text,
	"pic_phone" text,
	"pic_title" text,
	"pic_email" text,
	"payment_term_days" integer,
	"wapu" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_npwp_unique" ON "customer" USING btree ("npwp") WHERE "customer"."npwp" <> '010611200093000';--> statement-breakpoint
ALTER TABLE "customer" ENABLE ROW LEVEL SECURITY;
