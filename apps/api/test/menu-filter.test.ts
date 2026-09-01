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
  patch: (url: string) => request(app.getHttpServer()).patch(url).set('x-user-id', TEST_USER_ID),
};

const idea = (title: string, tried: boolean) => ({
  title,
  category: 'другое',
  energy: 'medium',
  estimatedTime: 'hour',
  cost: 'cheap',
  place: 'out',
  company: 'any',
  tried,
});

beforeAll(async () => {
  await prepareDatabase();
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  await api.post('/api/menu').send(idea('Сходить на выставку', false));
  await api.post('/api/menu').send(idea('Попробовать гончарку', true));
}, 60_000);

afterAll(async () => {
  await app?.close();
});

/**
 * Меню растёт, и половина списка — то, что уже пробовала. Фильтр по
 * попробованности отделяет одно от другого.
 */
describe('фильтр меню по попробованности', () => {
  it('без фильтра видно всё', async () => {
    const res = await api.get('/api/menu');
    expect(res.body).toHaveLength(2);
  });

  it('tried=false оставляет только непробованное', async () => {
    const res = await api.get('/api/menu').query({ tried: 'false' });
    expect(res.body.map((m: { title: string }) => m.title)).toEqual(['Сходить на выставку']);
  });

  it('tried=true оставляет только пробованное', async () => {
    const res = await api.get('/api/menu').query({ tried: 'true' });
    expect(res.body.map((m: { title: string }) => m.title)).toEqual(['Попробовать гончарку']);
  });

  it('строка «false» не считается истиной', async () => {
    // z.coerce.boolean() принял бы 'false' за true — отсюда явный enum в схеме
    const res = await api.get('/api/menu').query({ tried: 'false' });
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tried).toBe(false);
  });

  it('отметка «попробовала» сразу меняет выдачу фильтра', async () => {
    const all = await api.get('/api/menu');
    const fresh = all.body.find((m: { tried: boolean }) => !m.tried);
    await api.patch(`/api/menu/${fresh.id}`).send({ tried: true });

    expect((await api.get('/api/menu').query({ tried: 'false' })).body).toHaveLength(0);
    expect((await api.get('/api/menu').query({ tried: 'true' })).body).toHaveLength(2);
  });
});
