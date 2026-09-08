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
  deliveryMode ушёл из контракта: сервис всегда выводит его сам из scheduledTime,
  чтобы клиент не мог прислать точное время и «digest» (или наоборот) в одном запросе.
  `as never` здесь имитирует именно такой недобросовестный/устаревший вызов — контракт
  такого поля больше не принимает, но сервис обязан быть устойчив, если оно всё равно
  просочится (старый клиент, ручной запрос мимо типов).
*/
describe('deliveryMode нельзя рассинхронизировать со scheduledTime/timeSlot', () => {
  it('create: точное время побеждает подсунутый deliveryMode="digest"', async () => {
    const reminder = await service.create(TEST_USER_ID, {
      text: 'Позвонить в клинику',
      scheduledDate: '2026-09-14',
      scheduledTime: '18:00',
      timeSlot: 'day',
      deliveryMode: 'digest',
      source: 'web',
    } as never);

    expect(reminder.deliveryMode).toBe('alert');
    expect(reminder.scheduledTime).toBe('18:00');
    expect(reminder.timeSlot).toBeNull();
  });

  it('create: отсутствие времени побеждает подсунутый deliveryMode="alert"', async () => {
    const reminder = await service.create(TEST_USER_ID, {
      text: 'Купить хлеб',
      scheduledDate: '2026-09-20',
      timeSlot: 'day',
      deliveryMode: 'alert',
      source: 'web',
    } as never);

    expect(reminder.deliveryMode).toBe('digest');
    expect(reminder.scheduledTime).toBeNull();
    expect(reminder.timeSlot).toBe('day');
  });

  it('update: подсунутый deliveryMode без изменения времени ничего не трогает', async () => {
    const created = await service.create(TEST_USER_ID, {
      text: 'Забрать посылку',
      scheduledDate: '2026-09-20',
      scheduledTime: '12:00',
      source: 'web',
    });
    expect(created.deliveryMode).toBe('alert');

    const updated = await service.update(TEST_USER_ID, created.id, {
      comment: 'из пункта на Тверской',
      deliveryMode: 'digest',
    } as never);

    expect(updated.deliveryMode).toBe('alert');
    expect(updated.scheduledTime).toBe('12:00');
    expect(updated.timeSlot).toBeNull();
    expect(updated.comment).toBe('из пункта на Тверской');
  });

  it('update: подсунутый deliveryMode не мешает реальному переключению alert → digest', async () => {
    const created = await service.create(TEST_USER_ID, {
      text: 'Полить цветы',
      scheduledDate: '2026-09-20',
      scheduledTime: '09:00',
      source: 'web',
    });

    const updated = await service.update(
      TEST_USER_ID,
      created.id,
      { scheduledTime: null, timeSlot: 'evening', deliveryMode: 'alert' } as never,
      new Date('2026-09-20T04:00:00.000Z'), // 07:00 MSK, вечер ещё не наступил
    );

    expect(updated.deliveryMode).toBe('digest');
    expect(updated.scheduledTime).toBeNull();
    expect(updated.timeSlot).toBe('evening');
  });
});
