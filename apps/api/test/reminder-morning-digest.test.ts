import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
    .values({ userId: TEST_USER_ID, name: 'Актёрство', color: '--d-act' })
    .returning();
  const [project] = await db
    .insert(schema.projects)
    .values({
      userId: TEST_USER_ID,
      directionId: (direction as { id: string }).id,
      title: 'Подготовка',
    })
    .returning();
  projectId = (project as { id: string }).id;
}, 60_000);

afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await db.delete(schema.reminderDeliveries);
  await db.delete(schema.reminders);
  await db.delete(schema.calendarEvents);
  await db.delete(schema.calendars);
  await db.delete(schema.tasks);
  await db
    .update(schema.userSettings)
    .set({ morningDigestEnabled: true })
    .where(eq(schema.userSettings.userId, TEST_USER_ID));
});

async function collect(now: Date): Promise<string[]> {
  const { ReminderSchedulerService } = await import(
    '../src/modules/reminders/reminder-scheduler.service.js'
  );
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

async function makeCalendar(enabled = true): Promise<string> {
  const [cal] = await db
    .insert(schema.calendars)
    .values({ userId: TEST_USER_ID, name: 'Личный', provider: 'google', enabled })
    .returning();
  return (cal as { id: string }).id;
}

// утренний слот по умолчанию: 10:00 по Москве = 07:00 UTC
const MORNING_UTC = '2026-09-14T07:31:00.000Z';

/**
 * Утреннее сообщение раньше состояло из одних напоминаний. Дела из календаря
 * и задачи с приближающимся дедлайном показывались только на главной
 * странице веба — в Telegram их не было вовсе.
 */
describe('утренняя сводка: календарь и дедлайны в одном сообщении с напоминаниями', () => {
  it('календарь и дедлайн сегодня/завтра попадают в раздел «Сегодня», напоминание — в «Напоминания», одним сообщением', async () => {
    const calendarId = await makeCalendar();
    await db.insert(schema.calendarEvents).values({
      userId: TEST_USER_ID,
      calendarId,
      title: 'Ветклиника',
      date: '2026-09-14',
      time: '14:00',
    });
    await db.insert(schema.tasks).values([
      { userId: TEST_USER_ID, projectId, title: 'Сдать отчёт', deadline: '2026-09-14' },
      { userId: TEST_USER_ID, projectId, title: 'Прочитать сценарий', deadline: '2026-09-15' },
    ]);
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Полить цветы',
      scheduledDate: '2026-09-14',
      timezone: 'Europe/Moscow',
      deliveryMode: 'digest',
      timeSlot: 'morning',
      source: 'web',
    });

    const sent = await collect(new Date(MORNING_UTC));
    const morning = sent.find((t) => t.includes('Доброе утро'));

    expect(morning).toBeDefined();
    expect(sent).toHaveLength(1);
    expect(morning).toContain('Сегодня:');
    expect(morning).toContain('14:00 — Ветклиника');
    expect(morning).toContain('Сдать отчёт — дедлайн сегодня');
    expect(morning).toContain('Прочитать сценарий — дедлайн завтра');
    expect(morning).toContain('Напоминания:');
    expect(morning).toContain('Полить цветы');
    // раздел «Сегодня» должен идти раньше «Напоминания»
    expect(morning!.indexOf('Сегодня:')).toBeLessThan(morning!.indexOf('Напоминания:'));
  });

  it('задача с remindAt и дедлайном на сегодня попадает в сообщение один раз, а не дважды', async () => {
    await db.insert(schema.tasks).values({
      userId: TEST_USER_ID,
      projectId,
      title: 'Сдать отчёт',
      deadline: '2026-09-14',
      remindAt: '2026-09-14',
    });

    const sent = await collect(new Date(MORNING_UTC));
    const morning = sent.find((t) => t.includes('Доброе утро'));

    expect(morning).toBeDefined();
    expect(morning?.match(/Сдать отчёт/g)?.length).toBe(1);
    expect(morning).toContain('Сдать отчёт — дедлайн сегодня');
    expect(morning).not.toContain('Напоминания:');
  });

  it('только календарь и дедлайны, без единого напоминания — раздел «Напоминания» не появляется', async () => {
    const calendarId = await makeCalendar();
    await db.insert(schema.calendarEvents).values({
      userId: TEST_USER_ID,
      calendarId,
      title: 'Кастинг',
      date: '2026-09-14',
      time: '11:00',
    });

    const sent = await collect(new Date(MORNING_UTC));
    const morning = sent.find((t) => t.includes('Доброе утро'));

    expect(morning).toBeDefined();
    expect(morning).toContain('Сегодня:');
    expect(morning).not.toContain('Напоминания:');
  });

  it('только напоминание, без дел в календаре и дедлайнов — раздел «Сегодня» не появляется', async () => {
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Купить корм коту',
      scheduledDate: '2026-09-14',
      timezone: 'Europe/Moscow',
      deliveryMode: 'digest',
      timeSlot: 'morning',
      source: 'web',
    });

    const sent = await collect(new Date(MORNING_UTC));
    const morning = sent.find((t) => t.includes('Доброе утро'));

    expect(morning).toBeDefined();
    expect(morning).not.toContain('Сегодня:');
    expect(morning).toContain('Напоминания:');
    expect(morning).toContain('Купить корм коту');
  });

  it('дедлайн позавчера и событие календаря на другой день не попадают в сводку', async () => {
    const calendarId = await makeCalendar();
    await db.insert(schema.calendarEvents).values({
      userId: TEST_USER_ID,
      calendarId,
      title: 'Через неделю',
      date: '2026-09-21',
      time: '10:00',
    });
    await db.insert(schema.tasks).values({
      userId: TEST_USER_ID,
      projectId,
      title: 'Просроченный дедлайн',
      deadline: '2026-09-12',
    });

    const sent = await collect(new Date(MORNING_UTC));
    expect(sent.some((t) => t.includes('Через неделю'))).toBe(false);
    expect(sent.some((t) => t.includes('Просроченный дедлайн'))).toBe(false);
  });

  it('выключенный календарь в сводку не попадает', async () => {
    const calendarId = await makeCalendar(false);
    await db.insert(schema.calendarEvents).values({
      userId: TEST_USER_ID,
      calendarId,
      title: 'Скрытое событие',
      date: '2026-09-14',
      time: '09:00',
    });

    const sent = await collect(new Date(MORNING_UTC));
    expect(sent.some((t) => t.includes('Скрытое событие'))).toBe(false);
  });

  it('событие на весь день показывается без времени', async () => {
    const calendarId = await makeCalendar();
    await db.insert(schema.calendarEvents).values({
      userId: TEST_USER_ID,
      calendarId,
      title: 'День рождения мамы',
      date: '2026-09-14',
      time: '00:00',
      allDay: true,
    });

    const sent = await collect(new Date(MORNING_UTC));
    const morning = sent.find((t) => t.includes('Доброе утро'));
    expect(morning).toContain('— День рождения мамы');
    expect(morning).not.toContain('00:00 — День рождения мамы');
  });

  it('сводка не отправляется дважды за одно утро', async () => {
    const calendarId = await makeCalendar();
    await db.insert(schema.calendarEvents).values({
      userId: TEST_USER_ID,
      calendarId,
      title: 'Ветклиника',
      date: '2026-09-14',
      time: '14:00',
    });

    const first = await collect(new Date(MORNING_UTC));
    expect(first.some((t) => t.includes('Ветклиника'))).toBe(true);
    const second = await collect(new Date('2026-09-14T08:00:00.000Z'));
    expect(second.some((t) => t.includes('Ветклиника'))).toBe(false);
  });

  it('выключенная в настройках сводка не показывает календарь и дедлайны, но напоминания доходят как обычно', async () => {
    await db
      .update(schema.userSettings)
      .set({ morningDigestEnabled: false })
      .where(eq(schema.userSettings.userId, TEST_USER_ID));

    const calendarId = await makeCalendar();
    await db.insert(schema.calendarEvents).values({
      userId: TEST_USER_ID,
      calendarId,
      title: 'Ветклиника',
      date: '2026-09-14',
      time: '14:00',
    });
    await db.insert(schema.tasks).values({
      userId: TEST_USER_ID,
      projectId,
      title: 'Сдать отчёт',
      deadline: '2026-09-14',
    });
    await db.insert(schema.reminders).values({
      userId: TEST_USER_ID,
      text: 'Полить цветы',
      scheduledDate: '2026-09-14',
      timezone: 'Europe/Moscow',
      deliveryMode: 'digest',
      timeSlot: 'morning',
      source: 'web',
    });

    const sent = await collect(new Date(MORNING_UTC));
    const morning = sent.find((t) => t.includes('Доброе утро'));

    expect(morning).toBeDefined();
    expect(morning).not.toContain('Сегодня:');
    expect(morning).not.toContain('Ветклиника');
    expect(morning).not.toContain('Сдать отчёт');
    expect(morning).toContain('Напоминания:');
    expect(morning).toContain('Полить цветы');
  });
});
