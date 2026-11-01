import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

/*
  Ежедневный список живёт на тех же напоминаниях: пункт без уведомления —
  это напоминание с notify=false. Проверяем, что такой пункт честно стоит
  в своём дне, не пропадает после полуночи и никогда не порождает доставку.
*/

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let schema: typeof import('../src/db/schema.js');
let service: import('../src/modules/reminders/reminders.service.js').RemindersService;

async function makeScheduler(send: (n: { userId: string; text: string }) => Promise<void>) {
  const { ReminderSchedulerService } =
    await import('../src/modules/reminders/reminder-scheduler.service.js');
  const provider = { channel: 'test', canDeliver: async () => true, send };
  return new ReminderSchedulerService(db as never, provider as never);
}

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

describe('ежедневный список на напоминаниях', () => {
  it('пункт без уведомления встаёт ровно в выбранный день, без времени и слота', async () => {
    // 23:00 по Москве: все слоты дня прошли — обычное напоминание уехало бы на завтра
    const late = new Date('2026-11-01T20:00:00.000Z');
    const item = await service.create(
      TEST_USER_ID,
      { text: 'Развесить бельё', scheduledDate: '2026-11-01', notify: false, source: 'web' },
      late,
    );
    expect(item.notify).toBe(false);
    expect(item.scheduledDate).toBe('2026-11-01');
    expect(item.scheduledTime).toBeNull();
    expect(item.timeSlot).toBeNull();

    const reminder = await service.create(
      TEST_USER_ID,
      { text: 'Обычное', scheduledDate: '2026-11-01', source: 'web' },
      late,
    );
    expect(reminder.notify).toBe(true);
    expect(reminder.scheduledDate).toBe('2026-11-02');
  });

  it('пункт без уведомления не отправляется ни в сводке, ни догонялкой', async () => {
    await service.create(TEST_USER_ID, {
      text: 'Полить растения',
      scheduledDate: '2026-10-30',
      scheduledTime: '10:00',
      notify: false,
      source: 'web',
    });
    const sent: string[] = [];
    const scheduler = await makeScheduler(async (n) => {
      sent.push(n.text);
    });
    // утро, день и вечер следующего дня — пункт просрочен, но молчит
    await scheduler.processDue(new Date('2026-11-02T07:30:00.000Z'));
    await scheduler.processDue(new Date('2026-11-02T12:30:00.000Z'));
    await scheduler.processDue(new Date('2026-11-02T18:30:00.000Z'));
    expect(sent.join('\n')).not.toContain('Полить растения');
    expect(sent.join('\n')).not.toContain('Развесить бельё');
    // а обычное напоминание по-прежнему доходит
    expect(sent.join('\n')).toContain('Обычное');
  });

  it('невыполненный пункт после полуночи остаётся в списке со своей датой', async () => {
    const active = await service.listActive(TEST_USER_ID);
    const item = active.find((r) => r.text === 'Развесить бельё');
    expect(item?.scheduledDate).toBe('2026-11-01');
    expect(item?.status).toBe('active');
  });

  it('включение уведомления подбирает время, выключение — снимает его', async () => {
    const [item] = (await service.listActive(TEST_USER_ID)).filter(
      (r) => r.text === 'Развесить бельё',
    );
    const withTime = await service.update(TEST_USER_ID, item!.id, {
      notify: true,
      scheduledDate: '2026-11-05',
      scheduledTime: '09:30',
    });
    expect(withTime.notify).toBe(true);
    expect(withTime.deliveryMode).toBe('alert');
    expect(withTime.scheduledTime).toBe('09:30');

    const off = await service.update(TEST_USER_ID, item!.id, { notify: false });
    expect(off.notify).toBe(false);
    expect(off.scheduledTime).toBeNull();
    expect(off.deliveryMode).toBe('digest');
    expect(off.scheduledDate).toBe('2026-11-05');
  });

  it('выключенное уведомление отменяет и назначенный алерт', async () => {
    const r = await service.create(TEST_USER_ID, {
      text: 'Забрать посылку',
      scheduledDate: '2026-11-10',
      scheduledTime: '12:00',
      source: 'web',
    });
    await service.update(TEST_USER_ID, r.id, { notify: false });
    const sent: string[] = [];
    const scheduler = await makeScheduler(async (n) => {
      sent.push(n.text);
    });
    await scheduler.processDue(new Date('2026-11-10T09:00:30.000Z'));
    expect(sent.join('\n')).not.toContain('Забрать посылку');
  });

  it('выполнение и возврат: промах по чекбоксу исправим, удалённое не воскресает', async () => {
    const r = await service.create(TEST_USER_ID, {
      text: 'Позвонить',
      scheduledDate: '2026-11-01',
      notify: false,
      source: 'web',
    });
    const done = await service.complete(TEST_USER_ID, r.id);
    expect(done.status).toBe('done');
    const back = await service.reopen(TEST_USER_ID, r.id);
    expect(back.status).toBe('active');
    expect(back.closedAt).toBeNull();

    await service.remove(TEST_USER_ID, r.id);
    await expect(service.reopen(TEST_USER_ID, r.id)).rejects.toThrow();
  });

  it('ручной порядок сохраняется, новые пункты встают в конец', async () => {
    const a = await service.create(TEST_USER_ID, {
      text: 'A',
      scheduledDate: '2026-11-01',
      notify: false,
      source: 'web',
    });
    const b = await service.create(TEST_USER_ID, {
      text: 'B',
      scheduledDate: '2026-11-01',
      notify: false,
      source: 'web',
    });
    expect(b.sortOrder).toBeGreaterThan(a.sortOrder);
    await service.reorder(TEST_USER_ID, [b.id, a.id]);
    const [rowA] = await db.select().from(schema.reminders).where(eq(schema.reminders.id, a.id));
    const [rowB] = await db.select().from(schema.reminders).where(eq(schema.reminders.id, b.id));
    expect(rowB!.sortOrder).toBeLessThan(rowA!.sortOrder);
  });
});
