import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/planner_test';
export const TEST_USER_ID = '00000000-0000-4000-8000-0000000000ff';

/**
 * Имя базы считается тестовым, если оно так и называется. Не «содержит test»
 * где-то внутри: `planner_latest` или `contest` под это правило попадать
 * не должны.
 */
const TEST_DB_NAME = /^(?:test|.+[_-]test|test[_-].+)$/;

/** Имя базы из строки подключения. Пустое — значит имени в строке нет. */
export function databaseNameFromUrl(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return '';
  }
}

/**
 * Проверка перед миграциями и TRUNCATE.
 *
 * prepareDatabase() выносит из базы всё подчистую. Если TEST_DATABASE_URL
 * по ошибке указывает на рабочую базу — опечатка в переменной, скопированный
 * из продакшена .env, забытый экспорт в оболочке, — тесты сотрут настоящие
 * данные и сделают это молча. Поэтому: имя базы обязано быть явно тестовым,
 * иначе прогон останавливается, ничего не тронув.
 */
export function assertTestDatabase(url: string = TEST_DB_URL): void {
  const name = databaseNameFromUrl(url);
  if (!name) {
    throw new Error(
      `TEST_DATABASE_URL не содержит имени базы: «${url}». ` +
        'Тесты очищают базу целиком и без явного имени не запускаются.',
    );
  }
  if (!TEST_DB_NAME.test(name)) {
    throw new Error(
      `Отказываюсь очищать базу «${name}»: имя не выглядит тестовым. ` +
        'Тесты делают TRUNCATE всех таблиц. Заведите отдельную базу — ' +
        'например planner_test — и укажите её в TEST_DATABASE_URL.',
    );
  }
}

/** Прогоняет миграции и очищает таблицы перед набором тестов. */
export async function prepareDatabase(): Promise<void> {
  // до подключения: ни миграций, ни TRUNCATE по чужой базе
  assertTestDatabase();

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
