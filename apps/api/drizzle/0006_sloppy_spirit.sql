-- У одного пользователя должен остаться ровно один Telegram. Если их успело
-- накопиться несколько, оставляем самый свежий: он и есть тот, которым человек
-- пользуется. Уникальный индекс без этой уборки просто не создастся.
DELETE FROM "telegram_accounts" a
USING "telegram_accounts" b
WHERE a."user_id" = b."user_id"
  AND (a."created_at" < b."created_at"
       OR (a."created_at" = b."created_at" AND a."telegram_user_id" < b."telegram_user_id"));
--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_accounts_user_idx" ON "telegram_accounts" USING btree ("user_id");
