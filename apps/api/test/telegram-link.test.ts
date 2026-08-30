import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000fd';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let schema: typeof import('../src/db/schema.js');
let service: import('../src/modules/telegram/telegram-link.service.js').TelegramLinkService;

const chat = { telegramUserId: '111', chatId: '111', username: 'daria' };

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });
  await db.insert(schema.users).values({
    id: OTHER_USER_ID,
    email: 'other@planner.local',
    displayName: 'Сосед',
  });
  const { TelegramLinkService } = await import('../src/modules/telegram/telegram-link.service.js');
  service = new TelegramLinkService(db as never);
}, 60_000);

afterAll(async () => {
  await client?.end();
});

/** Прямая правка срока — единственный способ получить просроченный код. */
async function expire(code: string): Promise<void> {
  await db
    .update(schema.telegramLinkCodes)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(schema.telegramLinkCodes.code, code));
}

describe('связывание Telegram по одноразовому коду', () => {
  it('код привязывает чат именно к тому, кто его получил', async () => {
    const { code } = await service.issueCode(TEST_USER_ID);
    const result = await service.redeemCode(code, chat);
    expect(result.userId).toBe(TEST_USER_ID);

    const status = await service.status(TEST_USER_ID);
    expect(status.connected).toBe(true);
    expect(status.username).toBe('daria');
  });

  it('повторно использовать код нельзя', async () => {
    const { code } = await service.issueCode(TEST_USER_ID);
    await service.redeemCode(code, chat);
    await expect(service.redeemCode(code, chat)).rejects.toThrow();
  });

  it('просроченный код не принимается', async () => {
    const { code } = await service.issueCode(TEST_USER_ID);
    await expire(code);
    await expect(service.redeemCode(code, chat)).rejects.toThrow();
  });

  it('выдуманный чужой код не принимается', async () => {
    await expect(service.redeemCode('ZZZZ9999', chat)).rejects.toThrow();
  });

  it('новый код гасит предыдущий: на руках всегда один действующий', async () => {
    const first = await service.issueCode(TEST_USER_ID);
    const second = await service.issueCode(TEST_USER_ID);
    await expect(service.redeemCode(first.code, chat)).rejects.toThrow();
    await expect(service.redeemCode(second.code, chat)).resolves.toBeTruthy();
  });

  it('код одного пользователя не привязывает чат к другому', async () => {
    const mine = await service.issueCode(TEST_USER_ID);
    const result = await service.redeemCode(mine.code, {
      telegramUserId: '222',
      chatId: '222',
      username: null,
    });
    expect(result.userId).toBe(TEST_USER_ID);
    expect(result.userId).not.toBe(OTHER_USER_ID);

    const other = await service.status(OTHER_USER_ID);
    expect(other.connected).toBe(false);
  });

  it('отключение убирает связь и гасит невыданные коды', async () => {
    const { code } = await service.issueCode(TEST_USER_ID);
    await service.redeemCode(code, chat);
    expect((await service.status(TEST_USER_ID)).connected).toBe(true);

    const pending = await service.issueCode(TEST_USER_ID);
    await service.disconnect(TEST_USER_ID);

    expect((await service.status(TEST_USER_ID)).connected).toBe(false);
    await expect(service.redeemCode(pending.code, chat)).rejects.toThrow();
  });

  it('код не содержит похожих друг на друга символов', async () => {
    const { code } = await service.issueCode(TEST_USER_ID);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });
});
