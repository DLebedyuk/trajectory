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
let InboxService: typeof import('../src/modules/inbox/inbox.service.js').InboxService;
let MockAiProvider: typeof import('../src/modules/inbox/ai.provider.js').MockAiProvider;

let service: InstanceType<typeof InboxService>;

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });
  ({ InboxService } = await import('../src/modules/inbox/inbox.service.js'));
  ({ MockAiProvider } = await import('../src/modules/inbox/ai.provider.js'));
  service = new InboxService(db as never, new MockAiProvider() as never);
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
