CREATE TYPE "public"."po_state" AS ENUM('head', 'frm', 'director', 'approved', 'returned', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pr_state" AS ENUM('requested', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "goods_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"received_on" date NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"bast_number" text NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"request_id" uuid NOT NULL,
	"entity_code" text NOT NULL,
	"partner_id" text NOT NULL,
	"product_id" text,
	"description" text NOT NULL,
	"qty" numeric(14, 2) NOT NULL,
	"unit_price" numeric(20, 2) NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"ordered_on" date NOT NULL,
	"state" "po_state" DEFAULT 'head' NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_role" "role" NOT NULL,
	"created_unit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "purchase_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"project_id" uuid NOT NULL,
	"entity_code" text NOT NULL,
	"budget_line_id" uuid NOT NULL,
	"description" text NOT NULL,
	"estimate" numeric(20, 2) NOT NULL,
	"state" "pr_state" DEFAULT 'requested' NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_unit" text NOT NULL,
	"decided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_request_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "payment_request" ADD COLUMN "purchase_order_id" uuid;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_order_id_purchase_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_request_id_purchase_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_partner_id_partner_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_product_id_partner_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."partner_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_entity_code_company_entity_code_fk" FOREIGN KEY ("entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_budget_line_id_budget_line_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."budget_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goods_receipt_order_idx" ON "goods_receipt" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "purchase_order_request_idx" ON "purchase_order" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "purchase_request" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "purchase_order" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "goods_receipt" ENABLE ROW LEVEL SECURITY;
