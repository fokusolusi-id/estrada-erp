ALTER TABLE "line_comment" ADD COLUMN "author_role" "role" NOT NULL;--> statement-breakpoint
CREATE INDEX "line_comment_line_idx" ON "line_comment" USING btree ("line_id","created_at");