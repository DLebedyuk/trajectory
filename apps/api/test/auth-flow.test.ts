import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { prepareDatabase, TEST_DB_URL } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';
// настоящая авторизация проверяется без dev-подстановки: иначе не увидеть 401
process.env.DEV_AUTH = 'false';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.APP_BASE_URL = 'http://localhost:5173';

const PROFILE = {
  sub: 'google-sub-1',
  email: 'daria@example.com',
  name: 'Дарья',
  picture: null,
};

let app: INestApplication;
let server: ReturnType<INestApplication['getHttpServer']>;

/** Заглушка Google: сценарий проверяется целиком, но без сети. */
const fakeGoogle = {
  authorizeUrl: ({ state }: { state: string }) =>
    `https://accounts.google.test/auth?state=${state}`,
  exchangeCode: async () => ({
    accessToken: 'access',
    refreshToken: null,
    expiresAt: new Date(Date.now() + 3600_000),
    scope: 'openid email profile',
    idToken: 'stub-id-token',
  }),
  profileFromIdToken: () => PROFILE,
};

beforeAll(async () => {
  await prepareDatabase();
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
  const { GOOGLE_OAUTH } = await import('../src/modules/auth/google-oauth.js');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GOOGLE_OAUTH)
    .useValue(fakeGoogle)
    .compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  server = app.getHttpServer();
}, 60_000);

afterAll(async () => {
  await app?.close();
});

/** Проходит вход целиком и возвращает куку сессии. */
function stateFrom(location: string): string {
  const state = new URL(location).searchParams.get('state');
  if (!state) throw new Error('в редиректе нет state');
  return state;
}

async function login(): Promise<string> {
  const start = await request(server).get('/api/auth/google');
  const state = stateFrom(start.headers.location as string);
  const cb = await request(server).get(`/api/auth/google/callback?code=abc&state=${state}`);
  const cookie = cb.headers['set-cookie']?.[0];
  if (!cookie) throw new Error('сервер не выдал куку сессии');
  return cookie.split(';')[0] as string;
}

describe('вход через Google', () => {
  it('без сессии закрытые ручки отвечают 401', async () => {
    const res = await request(server).get('/api/dashboard');
    expect(res.status).toBe(401);
  });

  it('заголовок x-user-id больше не помогает, когда dev-режим выключен', async () => {
    const res = await request(server)
      .get('/api/dashboard')
      .set('x-user-id', '00000000-0000-4000-8000-000000000001');
    expect(res.status).toBe(401);
  });

  it('старт входа уводит на Google с одноразовым state', async () => {
    const res = await request(server).get('/api/auth/google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('accounts.google.test');
    expect(stateFrom(res.headers.location as string)).toBeTruthy();
  });

  it('после возврата от Google выдаётся сессия и появляется свой пользователь', async () => {
    const cookie = await login();
    expect(cookie).toContain('traektoria_session=');

    const me = await request(server).get('/api/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(PROFILE.email);
  });

  it('кука httpOnly и не уходит на чужие сайты', async () => {
    const start = await request(server).get('/api/auth/google');
    const state = stateFrom(start.headers.location as string);
    const cb = await request(server).get(`/api/auth/google/callback?code=abc&state=${state}`);
    const raw = cb.headers['set-cookie']?.[0] ?? '';
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('SameSite=Lax');
  });

  it('повторно использовать state нельзя', async () => {
    const start = await request(server).get('/api/auth/google');
    const state = stateFrom(start.headers.location as string);
    const first = await request(server).get(`/api/auth/google/callback?code=abc&state=${state}`);
    expect(first.status).toBe(302);

    const second = await request(server).get(`/api/auth/google/callback?code=abc&state=${state}`);
    expect(second.status).toBe(401);
  });

  it('чужой state не принимается', async () => {
    const res = await request(server).get('/api/auth/google/callback?code=abc&state=подделка');
    expect(res.status).toBe(401);
  });

  it('отказ на стороне Google возвращает в приложение без сессии', async () => {
    const res = await request(server).get('/api/auth/google/callback?error=access_denied');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('auth=denied');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('после выхода сессия перестаёт работать', async () => {
    const cookie = await login();
    expect((await request(server).get('/api/me').set('Cookie', cookie)).status).toBe(200);

    const out = await request(server).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(200);

    expect((await request(server).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('повторный вход тем же аккаунтом не плодит пользователей', async () => {
    const a = await login();
    const b = await login();
    const first = await request(server).get('/api/me').set('Cookie', a);
    const second = await request(server).get('/api/me').set('Cookie', b);
    expect(first.body.id).toBe(second.body.id);
  });
});
