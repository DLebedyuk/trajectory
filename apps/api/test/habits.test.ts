import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.DEV_AUTH = 'true';
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

const FOREIGN_USER_ID = '00000000-0000-4000-8000-0000000000fe';

let app: INestApplication;
const as = (userId: string) => ({
  get: (url: string) => request(app.getHttpServer()).get(url).set('x-user-id', userId),
  post: (url: string) => request(app.getHttpServer()).post(url).set('x-user-id', userId),
  patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-user-id', userId),
  del: (url: string) => request(app.getHttpServer()).delete(url).set('x-user-id', userId),
});
const api = as(TEST_USER_ID);

let vocal = '';
let reading = '';

beforeAll(async () => {
  await prepareDatabase();
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  vocal = (await api.post('/api/directions').send({ name: 'Вокал', color: '--d-vocal' })).body.id;
  reading = (await api.post('/api/directions').send({ name: 'Чтение', color: '--d-eng' })).body.id;
});

afterAll(async () => {
  await app.close();
});

/**
 * Привычки — «чем заняться, когда есть время». Живут в направлении, но это
 * не проект и не задача: без сроков и без статуса.
 */
describe('привычки', () => {
  let piano = '';

  it('создаётся в направлении и приходит с его именем и цветом', async () => {
    const res = await api
      .post('/api/habits')
      .send({ directionId: vocal, title: '  Попеть за пианино  ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      directionId: vocal,
      title: 'Попеть за пианино',
      directionName: 'Вокал',
      directionColor: '--d-vocal',
    });
    piano = res.body.id;
  });

  it('общий список — все направления, список направления — только его', async () => {
    await api.post('/api/habits').send({ directionId: reading, title: 'Почитать' });

    const all = await api.get('/api/habits');
    expect(all.body.map((h: { title: string }) => h.title).sort()).toEqual([
      'Попеть за пианино',
      'Почитать',
    ]);

    const onlyVocal = await api.get(`/api/habits?directionId=${vocal}`);
    expect(onlyVocal.body.map((h: { title: string }) => h.title)).toEqual(['Попеть за пианино']);
  });

  it('переименовывается', async () => {
    const res = await api.patch(`/api/habits/${piano}`).send({ title: 'Распеться за пианино' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Распеться за пианино');
  });

  it('пустое название не принимается', async () => {
    const res = await api.post('/api/habits').send({ directionId: vocal, title: '   ' });
    expect(res.status).toBe(400);
  });

  it('чужие привычки недоступны, а в чужое направление не добавить', async () => {
    const foreign = as(FOREIGN_USER_ID);
    expect((await foreign.get('/api/habits')).body).toEqual([]);
    expect((await foreign.patch(`/api/habits/${piano}`).send({ title: 'x' })).status).toBe(404);
    expect((await foreign.del(`/api/habits/${piano}`)).status).toBe(404);
    const intoForeign = await foreign
      .post('/api/habits')
      .send({ directionId: vocal, title: 'подмена' });
    expect(intoForeign.status).toBe(404);
  });

  it('у архивного направления привычки пропадают из списка', async () => {
    await api.post(`/api/directions/${reading}/archive`);
    const all = await api.get('/api/habits');
    expect(all.body.map((h: { title: string }) => h.title)).toEqual(['Распеться за пианино']);
  });

  it('удаление мягкое: из списка уходит, повторно не удаляется', async () => {
    expect((await api.del(`/api/habits/${piano}`)).status).toBe(200);
    expect((await api.get('/api/habits')).body).toEqual([]);
    expect((await api.del(`/api/habits/${piano}`)).status).toBe(404);
  });
});
