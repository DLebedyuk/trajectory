import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.DEV_AUTH = 'true';
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000fe';

let app: INestApplication;
let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let schema: typeof import('../src/db/schema.js');

const api = {
  get: (url: string) => request(app.getHttpServer()).get(url).set('x-user-id', TEST_USER_ID),
  post: (url: string) => request(app.getHttpServer()).post(url).set('x-user-id', TEST_USER_ID),
  patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-user-id', TEST_USER_ID),
};

/** Данные соседа: направление и проект, к которым у тестового пользователя нет доступа. */
let alienDirectionId = '';
let alienProjectId = '';
/** Свои данные: два направления, чтобы ловить рассогласование проект↔направление. */
let myDirectionId = '';
let mySecondDirectionId = '';
let myProjectId = '';
let archivedProjectId = '';

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });

  await db.insert(schema.users).values({
    id: OTHER_USER_ID,
    email: 'other@planner.local',
    displayName: 'Сосед',
    timezone: 'Europe/Moscow',
  });
  await db.insert(schema.userSettings).values({ userId: OTHER_USER_ID });
  await db.insert(schema.userFocus).values({ userId: OTHER_USER_ID });

  const [alienDir] = await db
    .insert(schema.directions)
    .values({ userId: OTHER_USER_ID, name: 'Чужое направление', color: '--d-eng' })
    .returning();
  alienDirectionId = (alienDir as { id: string }).id;
  const [alienProject] = await db
    .insert(schema.projects)
    .values({ userId: OTHER_USER_ID, directionId: alienDirectionId, title: 'Чужой проект' })
    .returning();
  alienProjectId = (alienProject as { id: string }).id;

  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const dir = await api.post('/api/directions').send({ name: 'Актёрство', color: '--d-act' });
  myDirectionId = dir.body.id;
  const dir2 = await api.post('/api/directions').send({ name: 'Английский', color: '--d-eng' });
  mySecondDirectionId = dir2.body.id;
  const project = await api
    .post('/api/projects')
    .send({ directionId: myDirectionId, title: 'Подготовить самопробу' });
  myProjectId = project.body.id;
  const archived = await api
    .post('/api/projects')
    .send({ directionId: myDirectionId, title: 'Закрытый проект' });
  archivedProjectId = archived.body.id;
  await api.post(`/api/projects/${archivedProjectId}/complete`).send({});
}, 60_000);

afterAll(async () => {
  await app?.close();
  await client?.end();
});

describe('целостность данных: чужое остаётся чужим', () => {
  it('нельзя перенести свой проект в чужое направление', async () => {
    const res = await api.patch(`/api/projects/${myProjectId}`).send({
      directionId: alienDirectionId,
    });
    expect(res.status).toBe(404);

    const check = await api.get(`/api/projects/${myProjectId}`);
    expect(check.body.directionId).toBe(myDirectionId);
  });

  it('нельзя записать касание в чужой проект', async () => {
    const res = await api.post('/api/touches').send({
      directionId: myDirectionId,
      projectId: alienProjectId,
      date: '2026-09-14',
      title: 'Порепетировала',
    });
    expect(res.status).toBe(404);
  });

  it('касание не может ссылаться на проект из другого направления', async () => {
    const res = await api.post('/api/touches').send({
      directionId: mySecondDirectionId,
      projectId: myProjectId,
      date: '2026-09-14',
      title: 'Позанималась',
    });
    expect(res.status).toBe(400);
  });

  it('разбор входящих не кладёт задачу в чужой проект', async () => {
    const item = await api
      .post('/api/inbox')
      .send({ originalText: 'Позвонить агенту', source: 'web' });
    const res = await api.post('/api/inbox/apply').send({
      proposals: [
        {
          inboxItemId: item.body.id,
          type: 'task',
          text: 'Позвонить агенту',
          projectId: alienProjectId,
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.applied).toBe(0);
    expect(res.body.skipped).toHaveLength(1);

    const alienTasks = await db.select().from(schema.tasks);
    expect(alienTasks.some((t) => t.title === 'Позвонить агенту')).toBe(false);
  });

  it('в завершённый проект нельзя добавить новую задачу', async () => {
    const res = await api
      .post('/api/tasks')
      .send({ projectId: archivedProjectId, title: 'Что-то ещё' });
    expect(res.status).toBe(409);
  });
});
