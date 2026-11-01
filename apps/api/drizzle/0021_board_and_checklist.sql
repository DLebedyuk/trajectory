ALTER TABLE "projects" ADD COLUMN "show_on_board" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "notify" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;