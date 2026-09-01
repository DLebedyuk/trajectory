import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000fc';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let schema: typeof import('../src/db/schema.js');
let telegram: import('../src/modules/telegram/telegram.service.js').TelegramService;
let reminders: import('../src/modules/reminders/reminders.service.js').RemindersService;
let inbox: import('../src/modules/inbox/inbox.service.js').InboxService;
let link: import('../src/modules/telegram/telegram-link.service.js').TelegramLinkService;

const TODAY = '2026-09-01';

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });
  await db
    .insert(schema.users)
    .values({ id: OTHER_USER_ID, email: 'other2@planner.local', displayName: 'Сосед' })
    .onConflictDoNothing();

  const { RemindersService } = await import('../src/modules/reminders/reminders.service.js');
  const { InboxService } = await import('../src/modules/inbox/inbox.service.js');
  const { MockAiProvider } = await import('../src/modules/inbox/ai.provider.js');
  const { TasksService } = await import('../src/modules/tasks/tasks.service.js');
  const { FocusService } = await import('../src/modules/focus/focus.service.js');
  const { ProjectsService } = await import('../src/modules/projects/projects.service.js');
  const { MenuService } = await import('../src/modules/menu/menu.service.js');
  const { MediaService } = await import('../src/modules/media/media.service.js');
  const { TelegramLinkService } = await import('../src/modules/telegram/telegram-link.service.js');
  const { TelegramService } = await import('../src/modules/telegram/telegram.service.js');

  reminders = new RemindersService(db as never);
  inbox = new InboxService(
    db as never,
    new MockAiProvider() as never,
    reminders as never,
    new TasksService(db as never, new FocusService(db as never) as never) as never,
    new ProjectsService(db as never) as never,
    new MenuService(db as never) as never,
    new MediaService(db as never) as never,
  );
  link = new TelegramLinkService(db as never);
  // маршрутизатор уведомлений в этом тесте не участвует: проверяем путь записи
  telegram = new TelegramService(
    db as never,
    reminders as never,
    inbox as never,
    { deliver: async () => undefined } as never,
    link as never,
  );
}, 60_000);

afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await db.delete(schema.reminders);
  await db.delete(schema.inboxItems);
  await db.delete(schema.telegramAccounts);
  await db.delete(schema.telegramLinkCodes);
});

/**
 * Проверено на живом стенде: бот пишет в базу правильно, а интерфейс какое-то
 * время показывает старый кеш. Здесь закрыт серверный конец пути — от текста
 * в чате до того самого списка, который читает экран напоминаний.
 */
describe('путь из Telegram до списка напоминаний', () => {
  it('сообщение боту становится активным напоминанием того же пользователя', async () => {
    await telegram.handleText(TEST_USER_ID, '111', 'напомни завтра забрать пальто', TODAY);

    const active = await reminders.listActive(TEST_USER_ID);
    const created = active.find((r) => r.text.includes('пальто'));
    expect(created).toBeDefined();
    expect(created?.userId).toBe(TEST_USER_ID);
    expect(created?.source).toBe('telegram');
    expect(created?.status).toBe('active');
    expect(created?.scheduledDate).toBe('2026-09-02');
  });

  it('текст без даты уходит во входящие того же пользователя', async () => {
    await telegram.handleText(TEST_USER_ID, '111', 'кто-то советовал книгу про Феллини', TODAY);

    const items = await inbox.list(TEST_USER_ID);
    expect(items).toHaveLength(1);
    expect(items[0]?.source).toBe('telegram');
    expect(items[0]?.userId).toBe(TEST_USER_ID);
  });

  it('напоминание создаётся у того, кто получил код привязки', async () => {
    const { code } = await link.issueCode(OTHER_USER_ID);
    const redeemed = await link.redeemCode(code, {
      telegramUserId: '222',
      chatId: '222',
      username: 'sosed',
    });
    expect(redeemed.userId).toBe(OTHER_USER_ID);

    await telegram.handleText(redeemed.userId, '222', 'напомни завтра оплатить интернет', TODAY);

    const mine = await reminders.listActive(TEST_USER_ID);
    const theirs = await reminders.listActive(OTHER_USER_ID);
    expect(theirs.some((r) => r.text.includes('интернет'))).toBe(true);
    // чужой чат не должен уметь класть напоминания в мой аккаунт
    expect(mine.some((r) => r.text.includes('интернет'))).toBe(false);
  });

  it('список активных отдаёт напоминание из Telegram без фильтра по источнику', async () => {
    await telegram.handleText(TEST_USER_ID, '111', 'напомни завтра полить цветы', TODAY);
    const [row] = await db
      .select()
      .from(schema.reminders)
      .where(eq(schema.reminders.userId, TEST_USER_ID));
    expect(row?.source).toBe('telegram');

    const active = await reminders.listActive(TEST_USER_ID);
    expect(active.map((r) => r.id)).toContain(row?.id);
  });
});
