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
    expect(await board()).toEqual({ columns: [], projects: [], tasks: [] });
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
    expect(await board()).toEqual({ columns: [], projects: [], tasks: [] });
  });

  it('чужое направление — 404', async () => {
    await as(STRANGER).get(`/api/tasks/board?directionId=${voice}`).expect(404);
  });
});

describe('столбцы доски', () => {
  let dir = '';
  let proj = '';
  let other = '';
  let foreignColumn = '';
  const boardOf = async () =>
    (await api.get(`/api/tasks/board?directionId=${dir}`).expect(200)).body;
  const addColumn = async (title: string) =>
    (await api.post('/api/board-columns').send({ directionId: dir, title }).expect(201)).body;
  const cardOf = async (id: string) =>
    (await boardOf()).tasks.find((t: { id: string }) => t.id === id);

  beforeAll(async () => {
    dir = (await api.post('/api/directions').send({ name: 'Озвучка 2' })).body.id;
    proj = await createProject(dir, 'Кот в сапогах');
    await api.patch(`/api/projects/${proj}`).send({ showOnBoard: true }).expect(200);
    const otherDir = (await api.post('/api/directions').send({ name: 'Другое' })).body.id;
    other = await createProject(otherDir, 'Чужой');
    foreignColumn = (
      await api.post('/api/board-columns').send({ directionId: otherDir, title: 'Там' })
    ).body.id;
  });

  it('у новой доски столбцов нет, задачи без столбца', async () => {
    const id = await createTask(proj, 'Серия 1');
    const b = await boardOf();
    expect(b.columns).toEqual([]);
    expect(b.tasks.find((t: { id: string }) => t.id === id).boardColumnId).toBeNull();
  });

  it('столбцы свои у направления и идут по порядку', async () => {
    const debts = await addColumn('  Долги ');
    await addColumn('Сегодня');
    await addColumn('На фиксах');
    const b = await boardOf();
    expect(b.columns.map((c: { title: string }) => c.title)).toEqual([
      'Долги',
      'Сегодня',
      'На фиксах',
    ]);
    expect(b.columns[0].id).toBe(debts.id);
  });

  it('задачу можно сразу создать в нужном столбце', async () => {
    const [, today] = (await boardOf()).columns;
    const task = (
      await api
        .post('/api/tasks')
        .send({ projectId: proj, title: 'Серия 2', boardColumnId: today.id })
        .expect(201)
    ).body;
    expect((await cardOf(task.id)).boardColumnId).toBe(today.id);
  });

  it('столбец чужого направления не принимается', async () => {
    await api
      .post('/api/tasks')
      .send({ projectId: proj, title: 'Серия 3', boardColumnId: foreignColumn })
      .expect(400);
    const id = await createTask(proj, 'Серия 4');
    await api.post(`/api/tasks/${id}/move`).send({ boardColumnId: foreignColumn }).expect(400);
    expect(other).toBeTruthy();
  });

  it('перенос между столбцами и обратно в первый', async () => {
    const [, , fixes] = (await boardOf()).columns;
    const id = await createTask(proj, 'Серия 5');
    await api.post(`/api/tasks/${id}/move`).send({ boardColumnId: fixes.id }).expect(201);
    expect((await cardOf(id)).boardColumnId).toBe(fixes.id);
    await api.post(`/api/tasks/${id}/move`).send({ boardColumnId: null }).expect(201);
    expect((await cardOf(id)).boardColumnId).toBeNull();
  });

  it('перенос из «Готово» возвращает задачу в работу', async () => {
    const [, today] = (await boardOf()).columns;
    const id = await createTask(proj, 'Серия 6');
    await api.post(`/api/tasks/${id}/complete`).send({ withTouch: true }).expect(201);
    expect((await cardOf(id)).status).toBe('done');
    await api.post(`/api/tasks/${id}/move`).send({ boardColumnId: today.id }).expect(201);
    const card = await cardOf(id);
    expect(card.status).toBe('open');
    expect(card.boardColumnId).toBe(today.id);
  });

  it('переименование и порядок', async () => {
    const [debts, today, fixes] = (await boardOf()).columns;
    await api.patch(`/api/board-columns/${fixes.id}`).send({ title: 'Правки' }).expect(200);
    await api
      .patch('/api/board-columns/reorder')
      .send({ ids: [today.id, debts.id, fixes.id] })
      .expect(200);
    expect((await boardOf()).columns.map((c: { title: string }) => c.title)).toEqual([
      'Сегодня',
      'Долги',
      'Правки',
    ]);
    await api.patch(`/api/board-columns/${fixes.id}`).send({ title: '   ' }).expect(400);
  });

  it('удалённый столбец отдаёт карточки в первый, задачи не пропадают', async () => {
    const cols = (await boardOf()).columns;
    const fixes = cols[2];
    const id = (
      await api
        .post('/api/tasks')
        .send({ projectId: proj, title: 'Серия 7', boardColumnId: fixes.id })
        .expect(201)
    ).body.id;
    await api.del(`/api/board-columns/${fixes.id}`).expect(200);
    const b = await boardOf();
    expect(b.columns).toHaveLength(2);
    expect(b.tasks.find((t: { id: string }) => t.id === id).boardColumnId).toBeNull();
  });

  it('больше восьми столбцов нельзя', async () => {
    const have = (await boardOf()).columns.length;
    for (let i = have; i < 8; i += 1) await addColumn(`Столбец ${i}`);
    await api.post('/api/board-columns').send({ directionId: dir, title: 'Лишний' }).expect(409);
  });

  it('чужие столбцы не видны и не правятся', async () => {
    const [col] = (await boardOf()).columns;
    await as(STRANGER).patch(`/api/board-columns/${col.id}`).send({ title: 'x' }).expect(404);
    await as(STRANGER).del(`/api/board-columns/${col.id}`).expect(404);
    await as(STRANGER)
      .post('/api/board-columns')
      .send({ directionId: dir, title: 'x' })
      .expect(404);
  });
});
