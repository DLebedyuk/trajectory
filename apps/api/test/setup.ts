import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/planner_test';
export const TEST_USER_ID = '00000000-0000-4000-8000-0000000000ff';

/** Прогоняет миграции и очищает таблицы перед набором тестов. */
export async function prepareDatabase(): Promise<void> {
  const client = postgres(TEST_DB_URL, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../drizzle') });
  await client.unsafe(`
    truncate table
      reminder_deliveries, reminders, task_checklist_items, tasks, touches, projects,
      directions, menu_items, media_items, media_categories, inbox_items,
      telegram_accounts, seed_markers, user_focus, user_settings, users
    restart identity cascade;
  `);
  await client.unsafe(
    `insert into users (id, email, display_name, timezone, locale)
     values ('${TEST_USER_ID}', 'test@planner.local', 'Тест', 'Europe/Moscow', 'ru')`,
  );
  await client.unsafe(`insert into user_settings (user_id) values ('${TEST_USER_ID}')`);
  await client.unsafe(`insert into user_focus (user_id) values ('${TEST_USER_ID}')`);
  await client.end();
}
