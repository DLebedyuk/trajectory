ALTER TABLE "reminders" ADD COLUMN "missed_notified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "missed_notified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "missed_reminder_repeat" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- «evening»/«nextDigest» на деле уже повторялись каждый день (ничего не двигало
-- scheduledDate у пропущенного) — true сохраняет фактическое поведение. У «none»
-- аналога «никогда» в новой модели нет — ближайшее по духу это «один раз».
UPDATE "user_settings" SET "missed_reminder_repeat" = false WHERE "missed_reminder_behavior" = 'none';