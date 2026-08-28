import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
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

async function makeScheduler(send: (n: { userId: string; text: string }) => Promise<void>) {
  const { ReminderSchedulerService } =
    await import('../src/modules/reminders/reminder-scheduler.service.js');
  const provider = { channel: 'test', canDeliver: async () => true, send };
  return new ReminderSchedulerService(db as never, provider as never);
}

describe('серверная доставка напоминаний', () => {
  it('13. отправляет наступившее напоминание', async () => {
    const [reminder] = await db
      .insert(schema.reminders)
      .values({
        userId: TEST_USER_ID,
        text: 'Позвонить в клинику',
        scheduledDate: '2026-08-27',
        scheduledTime: '10:00',
        timezone: 'Europe/Moscow',
        deliveryMode: 'alert',
        source: 'web',
      })
      .returning();

    const sent: string[] = [];
    const scheduler = await makeScheduler(async (n) => {
      sent.push(n.text);
    });

    // 10:00 по Москве = 07:00 UTC
    const count = await scheduler.processDue(new Date('2026-08-27T07:00:30.000Z'));
    expect(count).toBe(1);
    expect(sent[0]).toContain('Позвонить в клинику');

    const deliveries = await db
      .select()
      .from(schema.reminderDeliveries)
      .where(eq(schema.reminderDeliveries.reminderId, (reminder as { id: string }).id));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe('sent');
  });

  it('14. не отправляет одно и то же напоминание дважды', async () => {
    const sent: string[] = [];
    const scheduler = await makeScheduler(async (n) => {
      sent.push(n.text);
    });
    // три дополнительных прохода, включая «перезапуск приложения»
    await scheduler.processDue(new Date('2026-08-27T07:01:00.000Z'));
    await scheduler.processDue(new Date('2026-08-27T08:00:00.000Z'));
    const fresh = await makeScheduler(async (n) => {
      sent.push(n.text);
    });
    await fresh.processDue(new Date('2026-08-27T09:00:00.000Z'));
    expect(sent).toHaveLength(0);
  });

  it('не отправляет раньше времени', async () => {
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Будущее',
      scheduledDate: '2026-09-30',
      scheduledTime: '09:00',
      timezone: 'Europe/Moscow',
      deliveryMode: 'alert',
      source: 'web',
    });
    const sent: string[] = [];
    const scheduler = await makeScheduler(async (n) => {
      sent.push(n.text);
    });
    await scheduler.processDue(new Date('2026-08-27T10:00:00.000Z'));
    expect(sent.some((t) => t.includes('Будущее'))).toBe(false);
  });

  it('собирает напоминания без времени в одну дневную сводку', async () => {
    await db.insert(schema.reminders).values([
      {
        userId: TEST_USER_ID,
        text: 'Поставить стирку',
        scheduledDate: '2026-08-28',
        timezone: 'Europe/Moscow',
        deliveryMode: 'digest',
        source: 'telegram',
      },
      {
        userId: TEST_USER_ID,
        text: 'Записаться на английский',
        scheduledDate: '2026-08-28',
        timezone: 'Europe/Moscow',
        deliveryMode: 'digest',
        source: 'web',
      },
    ]);
    const sent: string[] = [];
    const scheduler = await makeScheduler(async (n) => {
      sent.push(n.text);
    });
    // сводка в 08:30 по Москве = 05:30 UTC
    await scheduler.processDue(new Date('2026-08-28T05:31:00.000Z'));
    const digest = sent.find((t) => t.includes('Доброе утро'));
    expect(digest).toBeDefined();
    expect(digest).toContain('Поставить стирку');
    expect(digest).toContain('Записаться на английский');
    expect(sent.filter((t) => t.includes('Доброе утро'))).toHaveLength(1);
  });

  it('повторяет временно неудавшуюся доставку и сдаётся после трёх попыток', async () => {
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Ненадёжное',
      scheduledDate: '2026-08-29',
      scheduledTime: '12:00',
      timezone: 'Europe/Moscow',
      deliveryMode: 'alert',
      source: 'web',
    });
    const attempt = vi.fn(async (n: { text: string }) => {
      if (n.text.includes('Ненадёжное')) throw new Error('канал недоступен');
    });
    const scheduler = await makeScheduler(attempt as never);
    for (let i = 0; i < 5; i += 1) {
      await scheduler.processDue(new Date('2026-08-29T09:00:00.000Z'));
    }
    const deliveries = await db.select().from(schema.reminderDeliveries);
    const target = deliveries.find((d) => d.error?.includes('канал недоступен'));
    expect(target?.status).toBe('failed');
    // ровно три попытки и ни одной сверх лимита
    expect(target?.attemptCount).toBe(3);
  });
});
