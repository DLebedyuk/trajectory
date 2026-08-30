import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { prepareDatabase, TEST_DB_URL } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';
process.env.DEV_AUTH = 'true';
process.env.TELEGRAM_MODE = 'off';
process.env.TELEGRAM_WEBHOOK_SECRET = 'webhook-secret-123';

let app: INestApplication;
let server: ReturnType<INestApplication['getHttpServer']>;

const UPDATE = { update_id: 1, message: { text: 'привет', chat: { id: 1 }, from: { id: 1 } } };

beforeAll(async () => {
  await prepareDatabase();
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  server = app.getHttpServer();
}, 60_000);

afterAll(async () => {
  await app?.close();
});

/**
 * Ручка вебхука доступна без сессии — её дёргает Telegram. Единственное, что
 * отличает настоящий апдейт от подделки, это секрет в заголовке.
 */
describe('вебхук Telegram', () => {
  it('без секрета апдейт не принимается', async () => {
    const res = await request(server).post('/api/telegram/webhook').send(UPDATE);
    expect(res.status).toBe(401);
  });

  it('с чужим секретом апдейт не принимается', async () => {
    const res = await request(server)
      .post('/api/telegram/webhook')
      .set('x-telegram-bot-api-secret-token', 'wrong-secret')
      .send(UPDATE);
    expect(res.status).toBe(401);
  });

  it('с правильным секретом апдейт принимается', async () => {
    const res = await request(server)
      .post('/api/telegram/webhook')
      .set('x-telegram-bot-api-secret-token', 'webhook-secret-123')
      .send(UPDATE);
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });
});
