import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_MODE = 'off';

let mod: typeof import('../src/common/current-user.js');

beforeAll(async () => {
  mod = await import('../src/common/current-user.js');
});

const DEV_USER = '00000000-0000-4000-8000-000000000001';
const devOn = { devAuth: true, devUserId: DEV_USER };
const devOff = { devAuth: false, devUserId: DEV_USER };

interface FakeRequest {
  userId?: string;
  header(name: string): string | undefined;
  headers: Record<string, string>;
}

/** Минимальный ExecutionContext: гвард читает только http-запрос. */
function contextWith(headers: Record<string, string>): { ctx: unknown; req: FakeRequest } {
  const req: FakeRequest = {
    header: (name: string) => headers[name.toLowerCase()],
    headers,
  };
  return { ctx: { switchToHttp: () => ({ getRequest: () => req }) }, req };
}

describe('заголовок x-user-id — только для разработки', () => {
  it('без dev-авторизации не доверяет x-user-id и отвечает 401', () => {
    expect(() => mod.resolveUserId(TEST_USER_ID, devOff)).toThrowError();
  });

  it('без dev-авторизации отказывает и при отсутствии заголовка', () => {
    expect(() => mod.resolveUserId(undefined, devOff)).toThrowError();
  });

  it('с dev-авторизацией заголовок работает — так тестируется многопользовательность', () => {
    expect(mod.resolveUserId(TEST_USER_ID, devOn)).toBe(TEST_USER_ID);
  });

  it('с dev-авторизацией без заголовка подставляет seed-пользователя', () => {
    expect(mod.resolveUserId(undefined, devOn)).toBe(DEV_USER);
  });

  it('не принимает заголовок, который не является UUID', () => {
    expect(() => mod.resolveUserId('admin', devOn)).toThrowError();
  });
});

describe('AuthGuard', () => {
  const noSessions = { resolveSession: async () => null } as never;

  it('без сессии в dev-режиме подставляет пользователя из заголовка', async () => {
    const guard = new mod.AuthGuard(noSessions);
    const { ctx, req } = contextWith({ 'x-user-id': TEST_USER_ID });
    expect(await guard.canActivate(ctx as never)).toBe(true);
    expect(req.userId).toBe(TEST_USER_ID);
  });

  it('настоящая сессия важнее dev-режима и заголовка', async () => {
    const sessionUser = '00000000-0000-4000-8000-0000000000aa';
    const withSession = { resolveSession: async () => sessionUser } as never;
    const guard = new mod.AuthGuard(withSession);
    const { ctx, req } = contextWith({
      'x-user-id': TEST_USER_ID,
      cookie: `traektoria_session=abc`,
    });
    expect(await guard.canActivate(ctx as never)).toBe(true);
    expect(req.userId).toBe(sessionUser);
  });

  it('протухшая кука не пускает мимо проверки заголовка', async () => {
    const guard = new mod.AuthGuard(noSessions);
    const { ctx } = contextWith({ 'x-user-id': 'admin', cookie: 'traektoria_session=stale' });
    await expect(guard.canActivate(ctx as never)).rejects.toThrow();
  });
});
