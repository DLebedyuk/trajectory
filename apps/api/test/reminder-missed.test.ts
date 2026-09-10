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

async function setRepeat(value: boolean): Promise<void> {
  await db
    .update(schema.userSettings)
    .set({ missedReminderRepeat: value })
    .where(eq(schema.userSettings.userId, TEST_USER_ID));
}

/**
 * Пропущенное напоминание — то, чей день уже прошёл. «Переспросить» в
 * настройках решает не «когда» (всегда в собственном слоте, вечер тут ничем
 * не выделен), а «сколько раз»: дублировать в каждой следующей сводке или
 * напомнить об этом ровно один раз.
 */
describe('переспросить: сколько раз догонять пропущенное', () => {
  it('выключено — догоняет ровно один раз в своём слоте, затем молчит', async () => {
    await setRepeat(false);
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Записаться к стоматологу',
      scheduledDate: '2026-09-08',
      timezone: 'Europe/Moscow',
      deliveryMode: 'digest',
      timeSlot: 'day',
      source: 'web',
    });

    // 9 сентября, дневной слот (15:00 MSK = 12:00 UTC)
    const first = await collect(new Date('2026-09-09T12:01:00.000Z'));
    const digest = first.find((t) => t.includes('Днём'));
    expect(digest).toContain('Записаться к стоматологу');

    // 10 сентября, тот же дневной слот — уже не приходит: своё единственное
    // напоминание использовано
    const second = await collect(new Date('2026-09-10T12:01:00.000Z'));
    expect(second.join('\n')).not.toContain('Записаться к стоматологу');
  });

  it('выключено — просроченный алерт тоже разово догоняет через дефолтный слот «утро»', async () => {
    await setRepeat(false);
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Просроченный алерт',
      scheduledDate: '2026-09-08',
      scheduledTime: '10:00',
      timezone: 'Europe/Moscow',
      deliveryMode: 'alert',
      source: 'web',
    });

    // утренний слот (10:00 MSK = 07:00 UTC) 9 сентября — единственный раз
    const first = await collect(new Date('2026-09-09T07:31:00.000Z'));
    expect(first.join('\n')).toContain('Просроченный алерт');

    const second = await collect(new Date('2026-09-10T07:31:00.000Z'));
    expect(second.join('\n')).not.toContain('Просроченный алерт');
  });

  it('включено — дублируется в каждой следующей сводке, в собственном слоте', async () => {
    await setRepeat(true);
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Оплатить домен',
      scheduledDate: '2026-09-11',
      timezone: 'Europe/Moscow',
      deliveryMode: 'digest',
      timeSlot: 'evening',
      source: 'web',
    });

    // вечерний слот (21:00 MSK = 18:00 UTC) 12 сентября
    const day1 = await collect(new Date('2026-09-12T18:01:00.000Z'));
    expect(day1.join('\n')).toContain('Оплатить домен');

    // и снова на следующий день — не «один раз», а до тех пор, пока не отмечено
    const day2 = await collect(new Date('2026-09-13T18:01:00.000Z'));
    expect(day2.join('\n')).toContain('Оплатить домен');
  });

  it('один и тот же вечер не повторяется дважды за один проход', async () => {
    await setRepeat(true);
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Полить орхидею',
      scheduledDate: '2026-09-11',
      timezone: 'Europe/Moscow',
      deliveryMode: 'digest',
      timeSlot: 'evening',
      source: 'web',
    });

    const first = await collect(new Date('2026-09-14T18:05:00.000Z'));
    expect(first.join('\n')).toContain('Полить орхидею');
    const second = await collect(new Date('2026-09-14T18:30:00.000Z'));
    expect(second.join('\n')).not.toContain('Полить орхидею');
  });
});
