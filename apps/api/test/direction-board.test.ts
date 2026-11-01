import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.DEV_AUTH = 'true';
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let app: INestApplication;
const as = (userId: string) => ({
  get: (url: string) => request(app.getHttpServer()).get(url).set('x-user-id', userId),
  post: (url: string) => request(app.getHttpServer()).post(url).set('x-user-id', userId),
  patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-user-id', userId),
  del: (url: string) => request(app.getHttpServer()).delete(url).set('x-user-id', userId),
});
const api = as(TEST_USER_ID);
const STRANGER = '00000000-0000-4000-8000-0000000000ee';

let voice = '';
let cartoonA = '';
let cartoonB = '';
let book = '';

const createProject = async (directionId: string, title: string) =>
  (await api.post('/api/projects').send({ directionId, title })).body.id as string;
const createTask = async (projectId: string, title: string) =>
  (await api.post('/api/tasks').send({ projectId, title })).body.id as string;
const board = async () => (await api.get(`/api/tasks/board?directionId=${voice}`).expect(200)).body;

beforeAll(async () => {
  await prepareDatabase();
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  voice = (await api.post('/api/directions').send({ name: 'Озвучка' })).body.id;
  cartoonA = await createProject(voice, 'Мультфильм A');
  cartoonB = await createProject(voice, 'Мультфильм B');
  book = await createProject(voice, 'Аудиокнига C');
  await createTask(cartoonA, 'Серия 1');
  await createTask(cartoonA, 'Серия 2');
  await createTask(cartoonB, 'Серия 1');
  await createTask(book, 'Глава 1');
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe('канбан-доска направления', () => {
  it('новый проект на доску не попадает: переключатель выключен по умолчанию', async () => {
    expect((await api.get(`/api/projects/${cartoonA}`)).body.showOnBoard).toBe(false);
    expect(await board()).toEqual({ projects: [], tasks: [] });
  });

  it('включённые проекты дают свои задачи с названием проекта', async () => {
    await api.patch(`/api/projects/${cartoonA}`).send({ showOnBoard: true }).expect(200);
    await api.patch(`/api/projects/${cartoonB}`).send({ showOnBoard: true }).expect(200);
    const b = await board();
    expect(b.projects.map((p: { title: string }) => p.title)).toEqual([
      'Мультфильм A',
      'Мультфильм B',
    ]);
    expect(b.tasks).toHaveLength(3);
    expect(
      b.tasks.map((t: { projectTitle: string; title: string }) => `${t.projectTitle}/${t.title}`),
    ).toContain('Мультфильм B/Серия 1');
  });

  it('перенос в «Готово» — это обычное закрытие задачи, проект видит то же самое', async () => {
    const card = (await board()).tasks.find(
      (t: { projectId: string; title: string }) =>
        t.projectId === cartoonA && t.title === 'Серия 1',
    );
    await api.post(`/api/tasks/${card.id}/complete`).send({ withTouch: false }).expect(201);
    const after = (await board()).tasks.find((t: { id: string }) => t.id === card.id);
    expect(after.status).toBe('done');
    // готовая задача остаётся на доске — в колонке «Готово»
    const open = (await api.get(`/api/tasks?projectId=${cartoonA}`)).body;
    expect(open.map((t: { title: string }) => t.title)).toEqual(['Серия 2']);

    await api.post(`/api/tasks/${card.id}/reopen`).expect(201);
    expect((await board()).tasks.find((t: { id: string }) => t.id === card.id).status).toBe('open');
  });

  it('активная задача помечена на карточке', async () => {
    const card = (await board()).tasks.find((t: { title: string }) => t.title === 'Серия 2');
    await api.post(`/api/tasks/${card.id}/activate`).expect(201);
    const after = (await board()).tasks.find((t: { id: string }) => t.id === card.id);
    expect(after.isActive).toBe(true);
  });

  it('выключение проекта убирает его карточки, а задачи остаются в проекте', async () => {
    await api.patch(`/api/projects/${cartoonB}`).send({ showOnBoard: false }).expect(200);
    const b = await board();
    expect(b.tasks.some((t: { projectId: string }) => t.projectId === cartoonB)).toBe(false);
    expect((await api.get(`/api/tasks?projectId=${cartoonB}`)).body).toHaveLength(1);
  });

  it('удалённый и завершённый проекты с доски пропадают сами', async () => {
    await api.patch(`/api/projects/${book}`).send({ showOnBoard: true }).expect(200);
    expect((await board()).projects).toHaveLength(2);
    await api.post(`/api/projects/${book}/complete`).expect(201);
    expect((await board()).projects.map((p: { id: string }) => p.id)).toEqual([cartoonA]);
    await api.del(`/api/projects/${cartoonA}`).expect(200);
    expect(await board()).toEqual({ projects: [], tasks: [] });
  });

  it('чужое направление — 404', async () => {
    await as(STRANGER).get(`/api/tasks/board?directionId=${voice}`).expect(404);
  });
});
