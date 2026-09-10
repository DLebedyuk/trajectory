ALTER TABLE "reminders" DROP COLUMN "missed_behavior";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "missed_reminder_behavior";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "hard_notifications";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "soft_notifications";