import { beforeAll, describe, expect, it } from 'vitest';
import { TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_MODE = 'off';

let DevAuthGuard: typeof import('../src/common/current-user.js').DevAuthGuard;

beforeAll(async () => {
  ({ DevAuthGuard } = await import('../src/common/current-user.js'));
});

const DEV_USER = '00000000-0000-4000-8000-000000000001';

interface FakeRequest {
  userId?: string;
  header(name: string): string | undefined;
}

/** Минимальный ExecutionContext: гвард читает только http-запрос. */
function contextWith(headers: Record<string, string>): {
  ctx: unknown;
  req: FakeRequest;
} {
  const req: FakeRequest = {
    header: (name: string) => headers[name.toLowerCase()],
  };
  return { ctx: { switchToHttp: () => ({ getRequest: () => req }) }, req };
}

describe('DevAuthGuard: заголовок x-user-id — только для разработки', () => {
  it('без dev-авторизации не доверяет x-user-id и отвечает 401', () => {
    const guard = new DevAuthGuard({ devAuth: false, devUserId: DEV_USER });
    const { ctx, req } = contextWith({ 'x-user-id': TEST_USER_ID });

    expect(() => guard.canActivate(ctx as never)).toThrowError();
    expect(req.userId).toBeUndefined();
  });

  it('с dev-авторизацией заголовок работает — так тестируется многопользовательность', () => {
    const guard = new DevAuthGuard({ devAuth: true, devUserId: DEV_USER });
    const { ctx, req } = contextWith({ 'x-user-id': TEST_USER_ID });

    expect(guard.canActivate(ctx as never)).toBe(true);
    expect(req.userId).toBe(TEST_USER_ID);
  });

  it('с dev-авторизацией без заголовка подставляет seed-пользователя', () => {
    const guard = new DevAuthGuard({ devAuth: true, devUserId: DEV_USER });
    const { ctx, req } = contextWith({});

    expect(guard.canActivate(ctx as never)).toBe(true);
    expect(req.userId).toBe(DEV_USER);
  });

  it('не принимает заголовок, который не является UUID', () => {
    const guard = new DevAuthGuard({ devAuth: true, devUserId: DEV_USER });
    const { ctx } = contextWith({ 'x-user-id': 'admin' });

    expect(() => guard.canActivate(ctx as never)).toThrowError();
  });
});
