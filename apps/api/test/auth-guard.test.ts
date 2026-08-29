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
}

/** Минимальный ExecutionContext: гвард читает только http-запрос. */
function contextWith(headers: Record<string, string>): { ctx: unknown; req: FakeRequest } {
  const req: FakeRequest = { header: (name: string) => headers[name.toLowerCase()] };
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

describe('DevAuthGuard', () => {
  it('кладёт пользователя из заголовка в запрос', () => {
    const guard = new mod.DevAuthGuard();
    const { ctx, req } = contextWith({ 'x-user-id': TEST_USER_ID });
    expect(guard.canActivate(ctx as never)).toBe(true);
    expect(req.userId).toBe(TEST_USER_ID);
  });

  /**
   * Гвард не должен иметь параметров конструктора: Nest создаёт его через
   * контейнер внедрения, и в собранном через tsc коде параметр-интерфейс
   * превращается в Object, которого в контейнере нет. В dev через tsx это
   * незаметно, а собранное приложение падает на старте.
   */
  it('не имеет параметров конструктора — иначе Nest не соберёт зависимости', () => {
    expect(mod.DevAuthGuard.length).toBe(0);
  });
});
