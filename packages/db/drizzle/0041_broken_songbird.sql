ALTER TABLE "customer" ADD COLUMN "group_entity_code" text;--> statement-breakpoint
ALTER TABLE "partner" ADD COLUMN "group_entity_code" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "revenue_coa" text;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_group_entity_code_company_entity_code_fk" FOREIGN KEY ("group_entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner" ADD CONSTRAINT "partner_group_entity_code_company_entity_code_fk" FOREIGN KEY ("group_entity_code") REFERENCES "public"."company_entity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Records already named like one of the group's companies are marked as that company; stewards can change it.
UPDATE "customer" c SET "group_entity_code" = e."code" FROM "company_entity" e
  WHERE regexp_replace(regexp_replace(lower(c."legal_name"), '^pt\.?\s+', ''), '[^a-z0-9]', '', 'g') = regexp_replace(regexp_replace(lower(e."name"), '^pt\.?\s+', ''), '[^a-z0-9]', '', 'g');--> statement-breakpoint
UPDATE "partner" p SET "group_entity_code" = e."code" FROM "company_entity" e
  WHERE regexp_replace(regexp_replace(lower(p."name"), '^pt\.?\s+', ''), '[^a-z0-9]', '', 'g') = regexp_replace(regexp_replace(lower(e."name"), '^pt\.?\s+', ''), '[^a-z0-9]', '', 'g');
