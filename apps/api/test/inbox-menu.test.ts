import { beforeAll, beforeEach, describe, expect, it, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { inboxProposalSchema } from '@planner/contracts';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let schema: typeof import('../src/db/schema.js');
type InboxServiceType = import('../src/modules/inbox/inbox.service.js').InboxService;

let service: InboxServiceType;

/**
 * Разбор входящих создаёт задачи, проекты, напоминания и записи полки через
 * их сервисы — собираем настоящие, а не заглушки: смысл теста в том, что
 * правила создания одни и те же и в приложении, и во входящих.
 */
async function buildInboxService(db: unknown) {
  const { InboxService } = await import('../src/modules/inbox/inbox.service.js');
  const { MockAiProvider } = await import('../src/modules/inbox/ai.provider.js');
  const { RemindersService } = await import('../src/modules/reminders/reminders.service.js');
  const { TasksService } = await import('../src/modules/tasks/tasks.service.js');
  const { FocusService } = await import('../src/modules/focus/focus.service.js');
  const { ProjectsService } = await import('../src/modules/projects/projects.service.js');
  const { MenuService } = await import('../src/modules/menu/menu.service.js');
  const { MediaService } = await import('../src/modules/media/media.service.js');
  return new InboxService(
    db as never,
    new MockAiProvider() as never,
    new RemindersService(db as never) as never,
    new TasksService(db as never, new FocusService(db as never) as never) as never,
    new ProjectsService(db as never) as never,
    new MenuService(db as never) as never,
    new MediaService(db as never) as never,
  );
}

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });
  service = (await buildInboxService(db)) as InboxServiceType;
}, 60_000);

afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await db.delete(schema.menuItems);
  await db.delete(schema.inboxItems);
});

async function addItem(text: string): Promise<string> {
  const item = await service.create(TEST_USER_ID, { originalText: text, source: 'web' });
  return item.id;
}

describe('контракт предложения входящих', () => {
  it('принимает параметры меню', () => {
    const parsed = inboxProposalSchema.safeParse({
      inboxItemId: '00000000-0000-4000-8000-0000000000aa',
      type: 'menu',
      text: 'Выставка Врубеля',
      menuCategory: 'выставки',
      energy: 'low',
      estimatedTime: 'hours',
      cost: 'budget',
      place: 'out',
    });
    expect(parsed.success).toBe(true);
  });

  it('отвергает значение не из набора', () => {
    const parsed = inboxProposalSchema.safeParse({
      inboxItemId: '00000000-0000-4000-8000-0000000000aa',
      type: 'menu',
      text: 'Выставка',
      energy: 'очень много',
    });
    expect(parsed.success).toBe(false);
  });

  it('отвергает постороннее поле, а не проглатывает его молча', () => {
    const parsed = inboxProposalSchema.safeParse({
      inboxItemId: '00000000-0000-4000-8000-0000000000aa',
      type: 'menu',
      text: 'Выставка',
      странноеПоле: 'что-то',
    });
    expect(parsed.success).toBe(false);
  });
});

/**
 * Раньше при применении типа «Идея меню» в menu_items уезжали только title и
 * comment, а energy/estimatedTime/cost/place/category молча брались из
 * defaults базы — человек их не выбирал и даже не видел.
 */
describe('применение идеи меню', () => {
  it('сохраняет ровно выбранные параметры', async () => {
    const id = await addItem('сходить на выставку Врубеля');
    const result = await service.apply(TEST_USER_ID, [
      {
        inboxItemId: id,
        type: 'menu',
        text: 'Выставка Врубеля',
        menuCategory: 'выставки',
        energy: 'low',
        estimatedTime: 'hours',
        cost: 'budget',
        place: 'out',
      },
    ]);
    expect(result.applied).toBe(1);

    const [row] = await db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.userId, TEST_USER_ID));
    expect(row?.title).toBe('Выставка Врубеля');
    expect(row?.category).toBe('выставки');
    expect(row?.energy).toBe('low');
    expect(row?.estimatedTime).toBe('hours');
    expect(row?.cost).toBe('budget');
    expect(row?.place).toBe('out');
  });

  it('без параметров берёт общие значения по умолчанию, а не тихие defaults базы', async () => {
    const id = await addItem('сходить погулять');
    await service.apply(TEST_USER_ID, [{ inboxItemId: id, type: 'menu', text: 'Погулять' }]);

    const [row] = await db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.userId, TEST_USER_ID));
    expect(row?.category).toBe('другое');
    expect(row?.energy).toBe('medium');
    expect(row?.estimatedTime).toBe('hour');
    expect(row?.cost).toBe('cheap');
    expect(row?.place).toBe('out');
  });
});
