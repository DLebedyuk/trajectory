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
};

let directionId = '';
let otherDirectionId = '';

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
  otherDirectionId = (await api.post('/api/directions').send({ name: 'Физика', color: '--d-phys' }))
    .body.id;

  const project = await api
    .post('/api/projects')
    .send({ directionId, title: 'Подготовить монолог Офелии' });
  const second = await api
    .post('/api/projects')
    .send({ directionId, title: 'Собрать материалы для сайта' });
  const foreign = await api
    .post('/api/projects')
    .send({ directionId: otherDirectionId, title: 'Разобрать механику' });

  const done1 = await api
    .post('/api/tasks')
    .send({ projectId: project.body.id, title: 'Выбрать редакцию перевода' });
  const done2 = await api
    .post('/api/tasks')
    .send({ projectId: second.body.id, title: 'Отобрать фотографии' });
  const openTask = await api
    .post('/api/tasks')
    .send({ projectId: project.body.id, title: 'Ещё не сделано' });
  const doneElsewhere = await api
    .post('/api/tasks')
    .send({ projectId: foreign.body.id, title: 'Задача другого направления' });

  await api.post(`/api/tasks/${done1.body.id}/complete`);
  await api.post(`/api/tasks/${done2.body.id}/complete`);
  await api.post(`/api/tasks/${doneElsewhere.body.id}/complete`);
  expect(openTask.status).toBe(201);
}, 60_000);

afterAll(async () => {
  await app?.close();
});

describe('архив направления', () => {
  it('собирает завершённые задачи всех проектов направления', async () => {
    const res = await api.get(`/api/tasks/done?directionId=${directionId}`);
    expect(res.status).toBe(200);
    const titles = (res.body as { title: string }[]).map((t) => t.title);
    expect(titles).toContain('Выбрать редакцию перевода');
    expect(titles).toContain('Отобрать фотографии');
  });

  it('у каждой задачи виден проект', async () => {
    const res = await api.get(`/api/tasks/done?directionId=${directionId}`);
    const row = (res.body as { title: string; projectTitle: string }[]).find(
      (t) => t.title === 'Выбрать редакцию перевода',
    );
    expect(row?.projectTitle).toBe('Подготовить монолог Офелии');
  });

  it('не показывает незавершённые задачи', async () => {
    const res = await api.get(`/api/tasks/done?directionId=${directionId}`);
    const titles = (res.body as { title: string }[]).map((t) => t.title);
    expect(titles).not.toContain('Ещё не сделано');
  });

  it('не смешивает направления', async () => {
    const res = await api.get(`/api/tasks/done?directionId=${directionId}`);
    const titles = (res.body as { title: string }[]).map((t) => t.title);
    expect(titles).not.toContain('Задача другого направления');
  });
});
