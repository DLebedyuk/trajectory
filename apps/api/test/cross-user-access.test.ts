import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.DEV_AUTH = 'true';
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000fd';

let app: INestApplication;
let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let schema: typeof import('../src/db/schema.js');

/** Запросы от лица тестового пользователя — того, кто пытается дотянуться до чужого. */
const api = {
  get: (url: string) => request(app.getHttpServer()).get(url).set('x-user-id', TEST_USER_ID),
  post: (url: string) => request(app.getHttpServer()).post(url).set('x-user-id', TEST_USER_ID),
  patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-user-id', TEST_USER_ID),
  del: (url: string) => request(app.getHttpServer()).delete(url).set('x-user-id', TEST_USER_ID),
};

const alien = {
  directionId: '',
  projectId: '',
  taskId: '',
  touchId: '',
  reminderId: '',
  menuItemId: '',
  mediaItemId: '',
};

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });

  await db.insert(schema.users).values({
    id: OTHER_USER_ID,
    email: 'neighbour@planner.local',
    displayName: 'Сосед',
    timezone: 'Europe/Moscow',
  });
  await db.insert(schema.userSettings).values({ userId: OTHER_USER_ID });
  await db.insert(schema.userFocus).values({ userId: OTHER_USER_ID });

  const id = <T extends { id: string }>(rows: T[]): string => (rows[0] as T).id;

  alien.directionId = id(
    await db
      .insert(schema.directions)
      .values({ userId: OTHER_USER_ID, name: 'Соседская озвучка', color: '--d-berry' })
      .returning(),
  );
  alien.projectId = id(
    await db
      .insert(schema.projects)
      .values({
        userId: OTHER_USER_ID,
        directionId: alien.directionId,
        title: 'Соседский проект',
      })
      .returning(),
  );
  alien.taskId = id(
    await db
      .insert(schema.tasks)
      .values({ userId: OTHER_USER_ID, projectId: alien.projectId, title: 'Соседская задача' })
      .returning(),
  );
  alien.touchId = id(
    await db
      .insert(schema.touches)
      .values({
        userId: OTHER_USER_ID,
        directionId: alien.directionId,
        projectId: alien.projectId,
        date: '2026-09-01',
        title: 'Соседское касание',
      })
      .returning(),
  );
  alien.reminderId = id(
    await db
      .insert(schema.reminders)
      .values({
        userId: OTHER_USER_ID,
        text: 'Соседское напоминание',
        scheduledDate: '2026-09-01',
        timezone: 'Europe/Moscow',
      })
      .returning(),
  );
  alien.menuItemId = id(
    await db
      .insert(schema.menuItems)
      .values({ userId: OTHER_USER_ID, title: 'Соседская идея' })
      .returning(),
  );
  alien.mediaItemId = id(
    await db
      .insert(schema.mediaItems)
      .values({ userId: OTHER_USER_ID, kind: 'book', title: 'Соседская книга' })
      .returning(),
  );

  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
}, 60_000);

afterAll(async () => {
  await app?.close();
  await client?.end();
});

/**
 * Изоляция пользователей: приложение задумано личным, но однажды в нём окажется
 * не один человек. Проверяем не «в коде есть userId», а поведение снаружи:
 * чужое не видно в списках и недоступно по прямой ссылке, даже если
 * идентификатор известен.
 */
describe('данные соседа недоступны', () => {
  it('в списках не появляется ничего чужого', async () => {
    const [directions, touches, reminders, menu, media] = await Promise.all([
      api.get('/api/directions'),
      api.get('/api/touches'),
      api.get('/api/reminders'),
      api.get('/api/menu'),
      api.get('/api/media'),
    ]);
    expect(directions.body).toEqual([]);
    expect(touches.body).toEqual([]);
    expect(reminders.body).toEqual([]);
    expect(menu.body).toEqual([]);
    expect(media.body).toEqual([]);
  });

  it('проекты чужого направления не отдаются даже по его идентификатору', async () => {
    const res = await api.get(`/api/projects?directionId=${alien.directionId}`);
    // ответ либо «нет такого направления», либо пустой список — но не чужие проекты
    if (res.status === 200) expect(res.body).toEqual([]);
    else expect(res.status).toBe(404);
  });

  it('по прямой ссылке чужое отдаётся как ненайденное', async () => {
    const responses = await Promise.all([
      api.get(`/api/directions/${alien.directionId}`),
      api.get(`/api/projects/${alien.projectId}`),
      api.get(`/api/tasks/${alien.taskId}`),
    ]);
    for (const res of responses) expect(res.status).toBe(404);
  });

  it('чужую задачу нельзя закрыть, переоткрыть, изменить или удалить', async () => {
    const responses = await Promise.all([
      api.post(`/api/tasks/${alien.taskId}/complete`).send({ withTouch: true }),
      api.post(`/api/tasks/${alien.taskId}/reopen`),
      api.patch(`/api/tasks/${alien.taskId}`).send({ title: 'Переименовано соседом' }),
      api.post(`/api/tasks/${alien.taskId}/pin`),
    ]);
    for (const res of responses) expect(res.status).toBe(404);

    await api.del(`/api/tasks/${alien.taskId}`);
    const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, alien.taskId));
    // удаление могло ответить «ok», ничего не удалив, — проверяем саму задачу
    expect(task).toBeDefined();
    expect(task?.title).toBe('Соседская задача');
  });

  it('чужое направление нельзя переименовать или убрать в архив', async () => {
    const patched = await api
      .patch(`/api/directions/${alien.directionId}`)
      .send({ name: 'Захвачено' });
    const archived = await api.post(`/api/directions/${alien.directionId}/archive`);
    expect(patched.status).toBe(404);
    expect(archived.status).toBe(404);
    const [dir] = await db
      .select()
      .from(schema.directions)
      .where(eq(schema.directions.id, alien.directionId));
    expect(dir?.name).toBe('Соседская озвучка');
    expect(dir?.archivedAt ?? null).toBeNull();
  });

  it('чужое касание не попадает ни в список, ни в карту', async () => {
    const list = await api.get('/api/touches');
    expect(list.body).toEqual([]);
    const heatmap = await api.get('/api/touches/heatmap?weeks=26');
    const filled = (heatmap.body.days as { total: number }[]).filter((d) => d.total > 0);
    expect(filled).toEqual([]);
  });

  it('главная не показывает чужой фокус и чужие дела', async () => {
    const res = await api.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.dueTasks).toEqual([]);
    expect(res.body.overdueTasks).toEqual([]);
    expect(res.body.todayReminders).toEqual([]);
    expect(res.body.focus?.direction ?? null).toBeNull();
  });
});
