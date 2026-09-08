import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let service: import('../src/modules/reminders/reminders.service.js').RemindersService;

beforeAll(async () => {
  await prepareDatabase();
  const schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });
  const { RemindersService } = await import('../src/modules/reminders/reminders.service.js');
  service = new RemindersService(db as never);
}, 60_000);

afterAll(async () => {
  await client?.end();
});

/*
  Дефолты слотов: утро 10:00, день 15:00, вечер 21:00 (Europe/Moscow, TEST_USER_ID
  из setup.js). 14 сентября 2026 — понедельник.
*/

describe('создание напоминания без времени — подбор слота', () => {
  it('совсем без времени — ближайший следующий слот сегодня', async () => {
    // 12:00 MSK — утро уже прошло, день (15:00) ещё нет
    const reminder = await service.create(
      TEST_USER_ID,
      { text: 'Позвонить дантисту', scheduledDate: '2026-09-14', source: 'web' },
      new Date('2026-09-14T09:00:00.000Z'),
    );
    expect(reminder.scheduledDate).toBe('2026-09-14');
    expect(reminder.timeSlot).toBe('day');
    expect(reminder.deliveryMode).toBe('digest');
  });

  it('все три слота на сегодня уже прошли — уезжает на завтрашнее утро', async () => {
    // 22:00 MSK — утро, день и вечер уже позади
    const reminder = await service.create(
      TEST_USER_ID,
      { text: 'Поставить стирку', scheduledDate: '2026-09-14', source: 'web' },
      new Date('2026-09-14T19:00:00.000Z'),
    );
    expect(reminder.scheduledDate).toBe('2026-09-15');
    expect(reminder.timeSlot).toBe('morning');
  });

  it('выбранный слот ещё не наступил — остаётся сегодня', async () => {
    const reminder = await service.create(
      TEST_USER_ID,
      { text: 'Записаться на английский', scheduledDate: '2026-09-14', timeSlot: 'day', source: 'web' },
      new Date('2026-09-14T09:00:00.000Z'), // 12:00 MSK, день ещё не наступил
    );
    expect(reminder.scheduledDate).toBe('2026-09-14');
    expect(reminder.timeSlot).toBe('day');
  });

  it('выбранный слот на сегодня уже прошёл — переносится на завтра', async () => {
    const reminder = await service.create(
      TEST_USER_ID,
      { text: 'Купить хлеб', scheduledDate: '2026-09-14', timeSlot: 'day', source: 'web' },
      new Date('2026-09-14T19:00:00.000Z'), // 22:00 MSK, день давно прошёл
    );
    expect(reminder.scheduledDate).toBe('2026-09-15');
    expect(reminder.timeSlot).toBe('day');
  });

  it('точное время — alert, слот и перенос не при чём', async () => {
    const reminder = await service.create(
      TEST_USER_ID,
      {
        text: 'Позвонить в клинику',
        scheduledDate: '2026-09-14',
        scheduledTime: '21:30',
        source: 'web',
      },
      new Date('2026-09-14T19:00:00.000Z'),
    );
    expect(reminder.scheduledDate).toBe('2026-09-14');
    expect(reminder.deliveryMode).toBe('alert');
    expect(reminder.timeSlot).toBeNull();
  });

  it('будущая дата без слота — дефолт «утро», сама дата не трогается', async () => {
    const reminder = await service.create(
      TEST_USER_ID,
      { text: 'Купить билеты', scheduledDate: '2026-09-20', source: 'web' },
      new Date('2026-09-14T19:00:00.000Z'),
    );
    expect(reminder.scheduledDate).toBe('2026-09-20');
    expect(reminder.timeSlot).toBe('morning');
  });
});
