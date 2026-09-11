import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
let projectId = '';

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });

  const [direction] = await db
    .insert(schema.directions)
    .values({ userId: TEST_USER_ID, name: 'Техническое', color: '--d-tech' })
    .returning();
  const [project] = await db
    .insert(schema.projects)
    .values({
      userId: TEST_USER_ID,
      directionId: (direction as { id: string }).id,
      title: 'Разное',
    })
    .returning();
  projectId = (project as { id: string }).id;

  // «переспросить» выключено — единственный шанс на догонку тем более важно не терять
  await db
    .update(schema.userSettings)
    .set({ missedReminderRepeat: false })
    .where(eq(schema.userSettings.userId, TEST_USER_ID));
}, 60_000);

afterAll(async () => {
  await client?.end();
});

/** Провайдер, который падает на первых `failTimes` отправках, затем отправляет успешно. */
function flakyProvider(failTimes: number): {
  provider: { channel: string; canDeliver: () => Promise<boolean>; send: (n: unknown) => Promise<void> };
  sent: string[];
} {
  let calls = 0;
  const sent: string[] = [];
  return {
    provider: {
      channel: 'test',
      canDeliver: async () => true,
      send: async (n) => {
        calls += 1;
        if (calls <= failTimes) throw new Error('Временный сбой доставки');
        sent.push((n as { text: string }).text);
      },
    },
    sent,
  };
}

async function tick(now: Date, provider: unknown): Promise<number> {
  const { ReminderSchedulerService } = await import(
    '../src/modules/reminders/reminder-scheduler.service.js'
  );
  const scheduler = new ReminderSchedulerService(db as never, provider as never);
  return scheduler.processDue(now);
}

/*
 * Раньше missedNotified выставлялся в true во время планирования — ещё до
 * успешной отправки. Сбой провайдера «сжигал» единственный шанс на догонку:
 * следующий проход видел missedNotified=true и больше не пытался, хотя
 * сообщение реально никуда не ушло. Теперь флаг выставляется только после
 * успешной send() — сбой оставляет missedNotified=false, а уже созданная
 * pending-доставка подхватывается повторно тем же механизмом retry.
 */
describe('разово пропущенное не теряется при сбое доставки', () => {
  it('напоминание: сбой на первой попытке, успех на второй, третий проход не повторяет', async () => {
    const { provider, sent } = flakyProvider(1);
    const [created] = await db
      .insert(schema.reminders)
      .values({
        userId: TEST_USER_ID,
        text: 'Полить кактус — тест сбоя',
        scheduledDate: '2026-09-08',
        timezone: 'Europe/Moscow',
        deliveryMode: 'digest',
        timeSlot: 'day',
        source: 'web',
      })
      .returning();

    // дневной слот (15:00 MSK = 12:00 UTC), 10 сентября — день уже пропущен
    const first = await tick(new Date('2026-09-10T12:01:00.000Z'), provider);
    expect(first).toBe(0);
    expect(sent).toHaveLength(0);
    const [afterFail] = await db
      .select()
      .from(schema.reminders)
      .where(eq(schema.reminders.id, created!.id));
    expect(afterFail?.missedNotified).toBe(false);

    // второй проход подхватывает ту же pending-доставку и на этот раз отправляет
    const second = await tick(new Date('2026-09-10T12:05:00.000Z'), provider);
    expect(second).toBe(1);
    expect(sent.join('\n')).toContain('Полить кактус — тест сбоя');
    const [afterSuccess] = await db
      .select()
      .from(schema.reminders)
      .where(eq(schema.reminders.id, created!.id));
    expect(afterSuccess?.missedNotified).toBe(true);

    // третий проход больше не пытается — единственный шанс уже использован
    const third = await tick(new Date('2026-09-10T12:10:00.000Z'), provider);
    expect(third).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('задача с remindAt: тот же сценарий — сбой не сжигает единственный шанс', async () => {
    const { provider, sent } = flakyProvider(1);
    const [created] = await db
      .insert(schema.tasks)
      .values({
        userId: TEST_USER_ID,
        projectId,
        title: 'Забрать реквизит — тест сбоя',
        remindAt: '2026-09-08',
      })
      .returning();

    // утренний слот (10:00 MSK = 07:00 UTC), 10 сентября — день уже пропущен
    const first = await tick(new Date('2026-09-10T07:31:00.000Z'), provider);
    expect(first).toBe(0);
    expect(sent).toHaveLength(0);
    const [afterFail] = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, created!.id));
    expect(afterFail?.missedNotified).toBe(false);

    const second = await tick(new Date('2026-09-10T07:35:00.000Z'), provider);
    expect(second).toBe(1);
    expect(sent.join('\n')).toContain('Забрать реквизит — тест сбоя');
    const [afterSuccess] = await db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.id, created!.id));
    expect(afterSuccess?.missedNotified).toBe(true);

    const third = await tick(new Date('2026-09-10T07:40:00.000Z'), provider);
    expect(third).toBe(0);
    expect(sent).toHaveLength(1);
  });
});
