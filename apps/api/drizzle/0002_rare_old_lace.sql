ALTER TABLE "reminder_deliveries" ALTER COLUMN "reminder_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD COLUMN "task_id" uuid;--> statement-breakpoint
UPDATE "reminder_deliveries" d SET "user_id" = r."user_id" FROM "reminders" r WHERE r."id" = d."reminder_id" AND d."user_id" IS NULL;--> statement-breakpoint
DELETE FROM "reminder_deliveries" WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_target_ck" CHECK (num_nonnulls("reminder_id", "task_id") <= 1);
