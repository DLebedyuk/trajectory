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
let ApiException: typeof import('../src/common/api-error.js').ApiException;

beforeAll(async () => {
  await prepareDatabase();
  const schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });
  const { SettingsService } = await import('../src/modules/settings/settings.service.js');
  service = new SettingsService(db as never);
  ({ ApiException } = await import('../src/common/api-error.js'));
}, 60_000);

afterAll(async () => {
  await client?.end();
});

/*
 * Порядок слотов должен быть хронологическим: утро раньше дня, день раньше
 * вечера. Иначе nearestSlot() и список вариантов переноса в RemindersPage
 * выбирают время в порядке morning→day→evening, а не по факту — «утро» в
 * 20:00 при «дне» в 10:00 предлагалось бы раньше «дня». Важно проверять
 * итоговый набор после слияния с частичным запросом, а не только присланные
 * поля: обновление одного лишь dayTime могло молча увести порядок в
 * бессмыслицу, если новое значение конфликтует с уже сохранёнными
 * morningTime/eveningTime.
 */
describe('настройки: порядок временных слотов', () => {
  it('полное обновление с неверным порядком отклоняется', async () => {
    await expect(
      service.update(TEST_USER_ID, {
        morningTime: '20:00',
        dayTime: '10:00',
        eveningTime: '15:00',
      }),
    ).rejects.toBeInstanceOf(ApiException);
  });

  it('частичное обновление проверяется против итоговых значений, а не только присланных', async () => {
    // дефолты: утро 10:00, вечер 21:00 — меняем только день на время раньше утра
    await expect(service.update(TEST_USER_ID, { dayTime: '09:00' })).rejects.toBeInstanceOf(
      ApiException,
    );
  });

  it('полное обновление в верном порядке сохраняется', async () => {
    const saved = await service.update(TEST_USER_ID, {
      morningTime: '08:00',
      dayTime: '13:00',
      eveningTime: '19:00',
    });
    expect(saved.morningTime).toBe('08:00');
    expect(saved.dayTime).toBe('13:00');
    expect(saved.eveningTime).toBe('19:00');
  });

  it('частичное обновление одного слота в пределах верного порядка сохраняется', async () => {
    // после предыдущего теста: утро 08:00, день 13:00, вечер 19:00
    const saved = await service.update(TEST_USER_ID, { dayTime: '14:00' });
    expect(saved.morningTime).toBe('08:00');
    expect(saved.dayTime).toBe('14:00');
    expect(saved.eveningTime).toBe('19:00');
  });

  it('отклонённое обновление не меняет сохранённые значения', async () => {
    const before = await service.get(TEST_USER_ID);
    // день сейчас 14:00 — переносим утро на 23:00, что ломает порядок
    await expect(service.update(TEST_USER_ID, { morningTime: '23:00' })).rejects.toBeInstanceOf(
      ApiException,
    );
    const after = await service.get(TEST_USER_ID);
    expect(after.morningTime).toBe(before.morningTime);
    expect(after.dayTime).toBe(before.dayTime);
    expect(after.eveningTime).toBe(before.eveningTime);
  });

  it('обновление, не трогающее время слотов, не проверяет порядок', async () => {
    // theme никак не связан со слотами — заведомо валидное обновление не должно спотыкаться
    const saved = await service.update(TEST_USER_ID, { theme: 'dark' });
    expect(saved.theme).toBe('dark');
  });
});
