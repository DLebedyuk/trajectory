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
let acting = '';
let demo = '';
let site = '';
let reel = '';
let monologue = '';

const createProject = async (directionId: string, title: string) =>
  (await api.post('/api/projects').send({ directionId, title })).body.id as string;

beforeAll(async () => {
  await prepareDatabase();
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  voice = (await api.post('/api/directions').send({ name: 'Озвучка', color: '--d-voice' })).body.id;
  acting = (await api.post('/api/directions').send({ name: 'Актёрство', color: '--d-act' })).body
    .id;

  demo = await createProject(voice, 'Подготовить демо');
  site = await createProject(voice, 'Обновить сайт');
  reel = await createProject(voice, 'Шоурил');
  monologue = await createProject(acting, 'Монолог Офелии');
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe('закрепление проектов', () => {
  it('новый проект не закреплён и без приоритета', async () => {
    const p = (await api.get(`/api/projects/${demo}`)).body;
    expect(p.pinned).toBe(false);
    expect(p.priority).toBeNull();
  });

  it('в одном направлении можно закрепить несколько проектов', async () => {
    await api.patch(`/api/projects/${demo}`).send({ pinned: true }).expect(200);
    await api.patch(`/api/projects/${site}`).send({ pinned: true }).expect(200);
    await api.patch(`/api/projects/${monologue}`).send({ pinned: true }).expect(200);

    expect((await api.get(`/api/projects/${demo}`)).body.pinned).toBe(true);
    expect((await api.get(`/api/projects/${site}`)).body.pinned).toBe(true);
  });

  it('закрепление не трогает фокус', async () => {
    const focus = (await api.get('/api/focus')).body;
    expect(focus.direction).toBeNull();
  });

  it('приоритет независим от закрепления и не меняет его', async () => {
    await api.patch(`/api/projects/${reel}`).send({ priority: 'high' }).expect(200);
    const p = (await api.get(`/api/projects/${reel}`)).body;
    expect(p.priority).toBe('high');
    expect(p.pinned).toBe(false);

    await api.patch(`/api/projects/${reel}`).send({ priority: null }).expect(200);
    expect((await api.get(`/api/projects/${reel}`)).body.priority).toBeNull();
  });

  it('неизвестный приоритет — ошибка валидации', async () => {
    await api.patch(`/api/projects/${reel}`).send({ priority: 'urgent' }).expect(400);
  });

  it('открепление не удаляет проект и его задачи', async () => {
    await api.post('/api/tasks').send({ projectId: site, title: 'Тексты' }).expect(201);
    await api.patch(`/api/projects/${site}`).send({ pinned: false }).expect(200);

    expect((await api.get(`/api/projects/${site}`)).body.pinned).toBe(false);
    const tasks = (await api.get(`/api/tasks?projectId=${site}`)).body;
    expect(tasks.map((t: { title: string }) => t.title)).toContain('Тексты');

    await api.patch(`/api/projects/${site}`).send({ pinned: true }).expect(200);
  });
});

describe('ручной порядок', () => {
  it('закреплённые меняются местами, незакреплённый остаётся на своём месте', async () => {
    // в направлении: demo(закр.), site(закр.), reel — меняем закреплённые
    await api
      .patch('/api/projects/reorder')
      .send({ ids: [site, demo] })
      .expect(200);

    const list = (await api.get(`/api/projects?directionId=${voice}`)).body as { id: string }[];
    expect(list.map((p) => p.id)).toEqual([site, demo, reel]);
  });

  it('порядок не меняет приоритет', async () => {
    await api.patch(`/api/projects/${demo}`).send({ priority: 'low' });
    await api
      .patch('/api/projects/reorder')
      .send({ ids: [demo, site] })
      .expect(200);
    expect((await api.get(`/api/projects/${demo}`)).body.priority).toBe('low');
    await api
      .patch('/api/projects/reorder')
      .send({ ids: [site, demo] })
      .expect(200);
  });

  it('нельзя смешивать направления в одном запросе', async () => {
    await api
      .patch('/api/projects/reorder')
      .send({ ids: [demo, monologue] })
      .expect(400);
  });

  it('чужие проекты переставить нельзя', async () => {
    await as(STRANGER)
      .patch('/api/projects/reorder')
      .send({ ids: [demo, site] })
      .expect(404);
  });
});

describe('обзор', () => {
  it('по умолчанию — только закреплённые, по порядку направлений и проектов', async () => {
    const o = (await api.get('/api/overview')).body;
    expect(o.projects.map((p: { id: string }) => p.id)).toEqual([site, demo, monologue]);
    expect(o.projects[0].directionName).toBe('Озвучка');
    expect(o.stats).toMatchObject({ directions: 2, projects: 4, pinned: 3 });
  });

  it('scope=all показывает и незакреплённые', async () => {
    const o = (await api.get('/api/overview?scope=all')).body;
    expect(o.projects).toHaveLength(4);
  });

  it('неизвестный scope — ошибка', async () => {
    await api.get('/api/overview?scope=everything').expect(400);
  });

  it('считает задачи, просроченные и ближайший срок', async () => {
    const t1 = (
      await api
        .post('/api/tasks')
        .send({ projectId: demo, title: 'Старое', deadline: '2020-01-01' })
    ).body.id;
    await api
      .post('/api/tasks')
      .send({ projectId: demo, title: 'Будущее', deadline: '2099-05-01' });
    const t3 = (await api.post('/api/tasks').send({ projectId: demo, title: 'Готово' })).body.id;
    await api.post(`/api/tasks/${t3}/complete`).send({}).expect(201);

    const o = (await api.get('/api/overview')).body;
    const p = o.projects.find((x: { id: string }) => x.id === demo);
    expect(p).toMatchObject({
      openTaskCount: 2,
      doneTaskCount: 1,
      overdueTaskCount: 1,
      nextDeadline: '2020-01-01',
    });
    expect(o.stats.overdueTasks).toBe(1);

    await api.post(`/api/tasks/${t1}/complete`).send({});
    const after = (await api.get('/api/overview')).body;
    expect(after.projects.find((x: { id: string }) => x.id === demo).nextDeadline).toBe(
      '2099-05-01',
    );
  });

  it('чужих проектов в обзоре нет', async () => {
    const o = (await as(STRANGER).get('/api/overview?scope=all')).body;
    expect(o.projects).toEqual([]);
    expect(o.stats.projects).toBe(0);
  });
});

describe('жизненный цикл', () => {
  it('завершённый проект уходит из обзора и теряет закрепление', async () => {
    await api.post(`/api/projects/${site}/complete`).expect(201);
    const p = (await api.get(`/api/projects/${site}`)).body;
    expect(p.pinned).toBe(false);

    const o = (await api.get('/api/overview?scope=all')).body;
    expect(o.projects.map((x: { id: string }) => x.id)).not.toContain(site);
  });

  it('завершённый проект закрепить нельзя', async () => {
    await api.patch(`/api/projects/${site}`).send({ pinned: true }).expect(400);
  });

  it('удалённый проект пропадает из обзора', async () => {
    await api.del(`/api/projects/${demo}`).expect(200);
    const o = (await api.get('/api/overview')).body;
    expect(o.projects.map((x: { id: string }) => x.id)).toEqual([monologue]);
  });

  it('проекты архивного направления в обзор не попадают', async () => {
    await api.post(`/api/directions/${acting}/archive`).expect(201);
    const o = (await api.get('/api/overview')).body;
    expect(o.projects).toEqual([]);
    expect(o.stats.directions).toBe(1);

    // вернулось направление — вернулось и закрепление
    await api.post(`/api/directions/${acting}/restore`).expect(201);
    const back = (await api.get('/api/overview')).body;
    expect(back.projects.map((x: { id: string }) => x.id)).toEqual([monologue]);
  });

  it('удалённое направление уносит свои проекты из обзора', async () => {
    await api.del(`/api/directions/${acting}`).expect(200);
    const o = (await api.get('/api/overview?scope=all')).body;
    expect(o.projects.map((x: { id: string }) => x.id)).toEqual([reel]);
  });
});
