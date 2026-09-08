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

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });
}, 60_000);

afterAll(async () => {
  await client?.end();
});

async function collect(now: Date): Promise<string[]> {
  const { ReminderSchedulerService } =
    await import('../src/modules/reminders/reminder-scheduler.service.js');
  const sent: string[] = [];
  const provider = {
    channel: 'test',
    canDeliver: async () => true,
    send: async (n: { text: string }) => {
      sent.push(n.text);
    },
  };
  const scheduler = new ReminderSchedulerService(db as never, provider as never);
  await scheduler.processDue(now);
  return sent;
}

/**
 * Пропущенное напоминание — то, чей день уже прошёл. Что с ним делать,
 * решает missedBehavior, и это решение должно исполняться.
 */
describe('missedBehavior: что делать с пропущенным напоминанием', () => {
  it('none — пропущенное не догоняет пользователя вообще', async () => {
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Забытое без догоняния',
      scheduledDate: '2026-09-08',
      timezone: 'Europe/Moscow',
      deliveryMode: 'digest',
      missedBehavior: 'none',
      source: 'web',
    });

    // 10 сентября, утренний слот (10:00 MSK = 07:00 UTC) и вечерний (21:00 MSK = 18:00 UTC)
    const morning = await collect(new Date('2026-09-10T07:31:00.000Z'));
    const evening = await collect(new Date('2026-09-10T18:01:00.000Z'));
    expect([...morning, ...evening].join('\n')).not.toContain('Забытое без догоняния');
  });

  it('none — просроченный алерт тоже не срабатывает задним числом', async () => {
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Просроченный алерт',
      scheduledDate: '2026-09-08',
      scheduledTime: '10:00',
      timezone: 'Europe/Moscow',
      deliveryMode: 'alert',
      missedBehavior: 'none',
      source: 'web',
    });

    const sent = await collect(new Date('2026-09-10T05:31:00.000Z'));
    expect(sent.join('\n')).not.toContain('Просроченный алерт');
  });

  it('nextDigest — пропущенное приходит в ближайшей утренней сводке', async () => {
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Записаться к стоматологу',
      scheduledDate: '2026-09-09',
      timezone: 'Europe/Moscow',
      deliveryMode: 'digest',
      missedBehavior: 'nextDigest',
      source: 'web',
    });

    const sent = await collect(new Date('2026-09-11T07:31:00.000Z'));
    const digest = sent.find((t) => t.includes('Доброе утро'));
    expect(digest).toContain('Записаться к стоматологу');
  });

  it('evening — пропущенное приходит вечером, а не в утренней сводке', async () => {
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Оплатить домен',
      scheduledDate: '2026-09-11',
      timezone: 'Europe/Moscow',
      deliveryMode: 'digest',
      missedBehavior: 'evening',
      source: 'web',
    });

    const morning = await collect(new Date('2026-09-12T07:31:00.000Z'));
    expect(morning.join('\n')).not.toContain('Оплатить домен');

    const evening = await collect(new Date('2026-09-12T18:01:00.000Z'));
    expect(evening.join('\n')).toContain('Оплатить домен');
  });

  it('вечернее догоняние не повторяется на следующем проходе того же вечера', async () => {
    const first = await collect(new Date('2026-09-12T18:05:00.000Z'));
    const second = await collect(new Date('2026-09-12T18:30:00.000Z'));
    expect([...first, ...second].join('\n')).not.toContain('Оплатить домен');
  });
});
