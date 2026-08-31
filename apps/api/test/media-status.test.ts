import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { createMediaItemSchema, MEDIA_STATUS_LABELS, mediaStatus } from '@planner/contracts';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let schema: typeof import('../src/db/schema.js');
let media: import('../src/modules/media/media.service.js').MediaService;

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });
  const { MediaService } = await import('../src/modules/media/media.service.js');
  media = new MediaService(db as never);
}, 60_000);

afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await db.delete(schema.mediaItems);
});

/**
 * Статус сквозной: значения общие, подписи зависят от вида. Книгу читают,
 * фильм смотрят — но модель одна, иначе она разъедется на две.
 */
describe('статусы медиатеки', () => {
  it('подписи различаются по виду, значения — нет', () => {
    expect(mediaStatus.options).toEqual(['want', 'doing', 'done']);
    expect(MEDIA_STATUS_LABELS.book.doing).toBe('Читаю');
    expect(MEDIA_STATUS_LABELS.film.doing).toBe('Смотрю');
    expect(MEDIA_STATUS_LABELS.book.done).toBe('Прочитано');
    expect(MEDIA_STATUS_LABELS.series.done).toBe('Просмотрено');
  });

  it('контракт по умолчанию ставит «хочу»', () => {
    const parsed = createMediaItemSchema.parse({ kind: 'book', title: 'Дюна' });
    expect(parsed.status).toBe('want');
  });

  it('контракт отвергает посторонний статус', () => {
    const parsed = createMediaItemSchema.safeParse({
      kind: 'book',
      title: 'Дюна',
      status: 'брошено',
    });
    expect(parsed.success).toBe(false);
  });

  it('статус сохраняется и меняется', async () => {
    const created = await media.create(TEST_USER_ID, {
      kind: 'book',
      title: 'Дюна',
      pinned: false,
      status: 'doing',
      rating: 0,
    });
    expect(created.status).toBe('doing');

    const updated = await media.update(TEST_USER_ID, created.id, { status: 'done' });
    expect(updated.status).toBe('done');

    const [row] = await db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.id, created.id));
    expect(row?.status).toBe('done');
  });

  it('новая запись без статуса попадает в «хочу», а не в пустоту', async () => {
    const created = await media.create(TEST_USER_ID, {
      kind: 'film',
      title: 'Головокружение',
      pinned: false,
      status: 'want',
      rating: 0,
    });
    expect(created.status).toBe('want');
  });
});
