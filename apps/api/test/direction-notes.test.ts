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

let directionId = '';

beforeAll(async () => {
  await prepareDatabase();
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  directionId = (await api.post('/api/directions').send({ name: 'Актёрство', color: '--d-act' }))
    .body.id;
});

afterAll(async () => {
  await app.close();
});

/**
 * Заметки направления. Раньше их не было вовсе: запись, относящаяся ко
 * всему направлению, приходилось класть в случайный проект.
 */
describe('заметки направления', () => {
  it('у нового направления заметок нет, но поле есть', async () => {
    const res = await api.get(`/api/directions/${directionId}`);
    expect(res.status).toBe(200);
    expect(res.body.notes).toEqual([]);
  });

  it('сохраняются и возвращаются в том же порядке', async () => {
    const notes = ['разобрать дыхание', 'купить пьесу'];
    const patched = await api.patch(`/api/directions/${directionId}`).send({ notes });
    expect(patched.status).toBe(200);
    expect(patched.body.notes).toEqual(notes);

    const reread = await api.get(`/api/directions/${directionId}`);
    expect(reread.body.notes).toEqual(notes);
  });

  it('приходят вместе со списком направлений — страницам не нужен отдельный запрос', async () => {
    const list = await api.get('/api/directions');
    const found = (list.body as { id: string; notes: string[] }[]).find(
      (d) => d.id === directionId,
    );
    expect(found?.notes).toEqual(['разобрать дыхание', 'купить пьесу']);
  });

  it('удаление заметки — это отправка списка без неё', async () => {
    const res = await api.patch(`/api/directions/${directionId}`).send({ notes: ['купить пьесу'] });
    expect(res.body.notes).toEqual(['купить пьесу']);
  });

  it('чужие направления недоступны', async () => {
    const foreign = await request(app.getHttpServer())
      .patch(`/api/directions/${directionId}`)
      .set('x-user-id', '00000000-0000-4000-8000-0000000000fe')
      .send({ notes: ['подмена'] });
    expect(foreign.status).toBeGreaterThanOrEqual(400);

    const mine = await api.get(`/api/directions/${directionId}`);
    expect(mine.body.notes).toEqual(['купить пьесу']);
  });
});
