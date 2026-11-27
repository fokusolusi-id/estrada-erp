CREATE TYPE "public"."partner_category" AS ENUM('Distributor', 'Principle');--> statement-breakpoint
CREATE TABLE "partner" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" "partner_category" NOT NULL,
	"npwp" text,
	"city" text,
	"address" text,
	"email" text,
	"phone" text,
	"pic_name" text,
	"pic_phone" text,
	"pic_title" text,
	"pic_email" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_product" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"brand" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_product_unique" UNIQUE("partner_id","category","type","brand")
);
--> statement-breakpoint
ALTER TABLE "partner_product" ADD CONSTRAINT "partner_product_partner_id_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "partner_product" ENABLE ROW LEVEL SECURITY;
