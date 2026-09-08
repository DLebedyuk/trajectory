import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let schema: typeof import('../src/db/schema.js');
let service: import('../src/modules/reminders/reminders.service.js').RemindersService;

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });
  const { RemindersService } = await import('../src/modules/reminders/reminders.service.js');
  service = new RemindersService(db as never);
}, 60_000);

afterAll(async () => {
  await client?.end();
});

async function makeReminder(text: string, date: string, time: string | null) {
  const [row] = await db
    .insert(schema.reminders)
    .values({
      userId: TEST_USER_ID,
      text,
      scheduledDate: date,
      scheduledTime: time,
      timezone: 'Europe/Moscow',
      deliveryMode: time ? 'alert' : 'digest',
      source: 'web',
    })
    .returning();
  return (row as { id: string }).id;
}

/** «Отложить» никогда не должно ставить напоминание в прошлое. */
describe('перенос напоминания', () => {
  it('«через час» поздно вечером переносит на завтра, а не на ночь того же дня', async () => {
    const id = await makeReminder('Позвонить маме', '2026-09-14', '23:30');
    // 23:30 по Москве 14 сентября = 20:30 UTC
    const result = await service.snooze(
      TEST_USER_ID,
      id,
      { mode: 'hour' },
      new Date('2026-09-14T20:30:00.000Z'),
    );
    expect(result.scheduledDate).toBe('2026-09-15');
    expect(result.scheduledTime).toBe('00:30');
  });

  it('«через час» днём остаётся в том же дне', async () => {
    const id = await makeReminder('Выпить воды', '2026-09-14', '14:10');
    const result = await service.snooze(
      TEST_USER_ID,
      id,
      { mode: 'hour' },
      new Date('2026-09-14T11:10:00.000Z'),
    );
    expect(result.scheduledDate).toBe('2026-09-14');
    expect(result.scheduledTime).toBe('15:10');
  });

  it('«вечером» после вечера переносит на завтрашний вечер', async () => {
    const id = await makeReminder('Полить цветы', '2026-09-14', '21:00');
    // уже 22:40 по Москве — сегодняшний вечерний слот (21:00 по умолчанию) уже прошёл
    const result = await service.snooze(
      TEST_USER_ID,
      id,
      { mode: 'evening' },
      new Date('2026-09-14T19:40:00.000Z'),
    );
    expect(result.scheduledDate).toBe('2026-09-15');
    expect(result.scheduledTime).toBeNull();
    expect(result.timeSlot).toBe('evening');
  });

  it('«завтра» считает завтра от сегодняшнего дня пользователя, а не от даты напоминания', async () => {
    const id = await makeReminder('Старое дело', '2026-09-01', null);
    const result = await service.snooze(
      TEST_USER_ID,
      id,
      { mode: 'tomorrow' },
      new Date('2026-09-14T11:00:00.000Z'),
    );
    expect(result.scheduledDate).toBe('2026-09-15');
  });
});
