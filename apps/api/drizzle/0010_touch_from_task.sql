ALTER TABLE "touches" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "touches" ADD CONSTRAINT "touches_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "touches_task_unique_idx" ON "touches" USING btree ("task_id");