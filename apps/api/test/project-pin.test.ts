import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.DEV_AUTH = 'true';
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let app: INestApplication;
const api = {
  get: (url: string) => request(app.getHttpServer()).get(url).set('x-user-id', TEST_USER_ID),
  post: (url: string) => request(app.getHttpServer()).post(url).set('x-user-id', TEST_USER_ID),
  put: (url: string) => request(app.getHttpServer()).put(url).set('x-user-id', TEST_USER_ID),
};

let voice = '';
let acting = '';
let demo = '';
let site = '';
let monologue = '';

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

  demo = (await api.post('/api/projects').send({ directionId: voice, title: 'Подготовить демо' }))
    .body.id;
  site = (await api.post('/api/projects').send({ directionId: voice, title: 'Обновить сайт' })).body
    .id;
  monologue = (
    await api.post('/api/projects').send({ directionId: acting, title: 'Монолог Офелии' })
  ).body.id;
}, 60_000);

afterAll(async () => {
  await app?.close();
});

/**
 * Закреплённый проект принадлежит направлению, а не приложению: в каждом
 * направлении он может быть только один, а на главную попадает тот, чьё
 * направление сейчас в фокусе.
 */
describe('закреплённый проект направления', () => {
  it('по умолчанию не закреплён ни один', async () => {
    const list = await api.get('/api/projects/pinned');
    expect(list.body).toEqual([]);
  });

  it('закрепление второго проекта в направлении снимает первый', async () => {
    await api.post(`/api/projects/${demo}/pin`);
    expect((await api.get(`/api/projects/${demo}`)).body.pinned).toBe(true);

    await api.post(`/api/projects/${site}/pin`);

    expect((await api.get(`/api/projects/${demo}`)).body.pinned).toBe(false);
    expect((await api.get(`/api/projects/${site}`)).body.pinned).toBe(true);

    const pinned = await api.get('/api/projects/pinned');
    expect(
      pinned.body.filter((p: { directionId: string }) => p.directionId === voice),
    ).toHaveLength(1);
  });

  it('у каждого направления своё закрепление — они не мешают друг другу', async () => {
    await api.post(`/api/projects/${monologue}/pin`);

    const pinned = await api.get('/api/projects/pinned');
    const ids = pinned.body.map((p: { id: string }) => p.id).sort();
    expect(ids).toEqual([monologue, site].sort());
  });

  it('на главной показывается закрепление того направления, что в фокусе', async () => {
    await api.put('/api/focus/direction').send({ directionId: voice, onConflict: 'clearTask' });
    expect((await api.get('/api/dashboard')).body.pinnedProject?.id).toBe(site);

    // меняется фокус — меняется и закреплённый проект, выбирать заново не нужно
    await api.put('/api/focus/direction').send({ directionId: acting, onConflict: 'clearTask' });
    expect((await api.get('/api/dashboard')).body.pinnedProject?.id).toBe(monologue);
  });

  it('без фокуса закреплённого проекта на главной нет', async () => {
    await api.put('/api/focus/direction').send({ directionId: null, onConflict: 'clearTask' });
    expect((await api.get('/api/dashboard')).body.pinnedProject).toBeNull();

    await api.put('/api/focus/direction').send({ directionId: voice, onConflict: 'clearTask' });
  });

  it('снятие закрепления не трогает другие направления', async () => {
    await api.post(`/api/projects/${site}/unpin`);

    expect((await api.get(`/api/projects/${site}`)).body.pinned).toBe(false);
    expect((await api.get(`/api/projects/${monologue}`)).body.pinned).toBe(true);
    expect((await api.get('/api/dashboard')).body.pinnedProject).toBeNull();
  });

  it('завершённый проект закрепить нельзя', async () => {
    await api.post(`/api/projects/${site}/complete`);
    const res = await api.post(`/api/projects/${site}/pin`);
    expect(res.status).toBe(400);
    expect((await api.get(`/api/projects/${site}`)).body.pinned).toBe(false);
  });

  it('завершение закреплённого проекта снимает закрепление', async () => {
    await api.post(`/api/projects/${demo}/pin`);
    expect((await api.get(`/api/projects/${demo}`)).body.pinned).toBe(true);

    await api.post(`/api/projects/${demo}/complete`);

    expect((await api.get(`/api/projects/${demo}`)).body.pinned).toBe(false);
    expect(
      (await api.get('/api/projects/pinned')).body.map((p: { id: string }) => p.id),
    ).not.toContain(demo);
  });

  it('чужой проект закрепить нельзя', async () => {
    const foreign = await request(app.getHttpServer())
      .post(`/api/projects/${monologue}/unpin`)
      .set('x-user-id', '00000000-0000-4000-8000-0000000000fe');
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    expect((await api.get(`/api/projects/${monologue}`)).body.pinned).toBe(true);
  });
});
