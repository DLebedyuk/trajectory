import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let service: import('../src/modules/settings/settings.service.js').SettingsService;

beforeAll(async () => {
  await prepareDatabase();
  const schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });
  const { SettingsService } = await import('../src/modules/settings/settings.service.js');
  service = new SettingsService(db as never);
}, 60_000);

afterAll(async () => {
  await client?.end();
});

/**
 * Раздел «Сегодня» (календарь + дедлайны) в утреннем сообщении — новая
 * возможность, включена по умолчанию для всех: выключить её можно отдельной
 * галочкой в настройках, не трогая обычные напоминания.
 */
describe('настройки: галочка утренней сводки', () => {
  it('по умолчанию включена', async () => {
    const s = await service.get(TEST_USER_ID);
    expect(s.morningDigestEnabled).toBe(true);
  });

  it('можно выключить и снова включить', async () => {
    const off = await service.update(TEST_USER_ID, { morningDigestEnabled: false });
    expect(off.morningDigestEnabled).toBe(false);

    const stillOff = await service.get(TEST_USER_ID);
    expect(stillOff.morningDigestEnabled).toBe(false);

    const on = await service.update(TEST_USER_ID, { morningDigestEnabled: true });
    expect(on.morningDigestEnabled).toBe(true);
  });

  it('обновление другого поля не трогает сохранённое значение галочки', async () => {
    await service.update(TEST_USER_ID, { morningDigestEnabled: false });
    const saved = await service.update(TEST_USER_ID, { theme: 'dark' });
    expect(saved.morningDigestEnabled).toBe(false);
    // возвращаем дефолт, чтобы не влиять на остальные тесты этого файла/сьюта
    await service.update(TEST_USER_ID, { morningDigestEnabled: true });
  });
});
