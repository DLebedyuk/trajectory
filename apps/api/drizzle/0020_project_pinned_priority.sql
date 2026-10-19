ALTER TABLE "projects" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "priority" varchar(10);--> statement-breakpoint
CREATE INDEX "projects_pinned_idx" ON "projects" USING btree ("user_id") WHERE "projects"."pinned";