ALTER TABLE "media_items" ADD COLUMN "status" varchar(10) DEFAULT 'want' NOT NULL;--> statement-breakpoint
-- Существующим записям назначаем разумное начальное состояние: закреплённое
-- человек держит на виду, потому что читает или смотрит это сейчас. Всё
-- остальное — «хочу»: обещать «прочитано» за пользователя нельзя.
UPDATE "media_items" SET "status" = 'doing' WHERE "pinned" = true;
