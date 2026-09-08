ALTER TABLE "reminders" ADD COLUMN "time_slot" varchar(10);--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "morning_time" varchar(5) DEFAULT '10:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "day_time" varchar(5) DEFAULT '15:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "evening_time" varchar(5) DEFAULT '21:00' NOT NULL;--> statement-breakpoint
-- Раньше было одно время дневной сводки — переносим его в «утро», самый
-- близкий аналог. День и вечер остаются на дефолтах, их никто ещё не настраивал.
UPDATE "user_settings" SET "morning_time" = "digest_time";--> statement-breakpoint
-- Все существующие digest-напоминания раньше не различались по времени суток —
-- считаем их «утренними», как и работала единая сводка.
UPDATE "reminders" SET "time_slot" = 'morning' WHERE "delivery_mode" = 'digest';