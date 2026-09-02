import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { assertTestDatabase, databaseNameFromUrl, prepareDatabase, TEST_USER_ID } from './setup.js';

let app: INestApplication;
const api = {
  get: (url: string) => request(app.getHttpServer()).get(url).set('x-user-id', TEST_USER_ID),
  post: (url: string) => request(app.getHttpServer()).post(url).set('x-user-id', TEST_USER_ID),
};

beforeAll(async () => {
  await prepareDatabase();
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../src/app.module.js');
  const { AllExceptionsFilter } = await import('../src/common/http-exception.filter.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
}, 60_000);

afterAll(async () => {
  await app?.close();
});

/**
 * Изоляция прогона. Ни один из этих тестов не проверяет продуктовое
 * поведение — они проверяют, что обычный `pnpm test` безопасен: не платит
 * за живой ИИ, не пишет в чужие сервисы и не сотрёт рабочую базу.
 */
describe('тесты изолированы от окружения разработчика', () => {
  it('окружение выставлено принудительно, а не подхвачено из .env', async () => {
    const { env } = await import('../src/config/env.js');
    expect(env.NODE_ENV).toBe('test');
    expect(env.DEV_AUTH).toBe(true);
    expect(env.TELEGRAM_MODE).toBe('off');
    expect(env.AI_PROVIDER).toBe('mock');
    expect(env.AI_API_KEY).toBe('');
    expect(env.TELEGRAM_BOT_TOKEN).toBe('');
  });

  it('в контейнере поднят mock-провайдер, а не живой OpenAI', async () => {
    const { AI_PROVIDER } = await import('../src/modules/inbox/ai.provider.js');
    const { MockAiProvider } = await import('../src/modules/inbox/ai.provider.js');
    expect(app.get(AI_PROVIDER)).toBeInstanceOf(MockAiProvider);
  });

  it('разбор входящих не ходит в сеть', async () => {
    await api.post('/api/inbox').send({ originalText: 'напомни завтра забрать заказ' });
    await api.post('/api/inbox').send({ originalText: 'сходить на выставку Врубеля' });

    const before = globalThis.__blockedNetworkCalls?.().length ?? 0;
    const res = await api.post('/api/inbox/propose');
    const after = globalThis.__blockedNetworkCalls?.().length ?? 0;

    expect(res.status).toBe(201);
    expect(res.body.length).toBeGreaterThan(0);
    expect(after).toBe(before);
  });

  it('за весь прогон не было ни одного запроса наружу', () => {
    // сторож стоит в test/env.setup.ts и записывает каждую попытку
    expect(globalThis.__blockedNetworkCalls?.() ?? []).toEqual([]);
  });

  it('попытка выйти в сеть падает, а не проходит молча', async () => {
    await expect(fetch('https://api.openai.com/v1/chat/completions')).rejects.toThrow(
      /Тесты не ходят в сеть/,
    );
    // сторож зафиксировал попытку — значит он живой, а прошлый тест не был
    // зелёным просто потому, что список никто не наполняет
    expect(globalThis.__blockedNetworkCalls?.().at(-1)?.url).toContain('api.openai.com');
  });
});

describe('тесты не могут очистить рабочую базу', () => {
  it('явно тестовые имена проходят', () => {
    for (const name of ['planner_test', 'test', 'test_planner', 'app-test']) {
      expect(() => assertTestDatabase(`postgres://u@127.0.0.1:5432/${name}`)).not.toThrow();
    }
  });

  it('рабочее имя останавливает прогон до миграций', () => {
    expect(() => assertTestDatabase('postgres://u@db.example.com:5432/planner')).toThrow(
      /Отказываюсь очищать базу «planner»/,
    );
  });

  it('имя со словом test внутри не считается тестовым', () => {
    // planner_latest и contest — обычные базы, а не тестовые
    expect(() => assertTestDatabase('postgres://u@127.0.0.1:5432/planner_latest')).toThrow();
    expect(() => assertTestDatabase('postgres://u@127.0.0.1:5432/contest')).toThrow();
  });

  it('строка без имени базы тоже отклоняется', () => {
    expect(() => assertTestDatabase('postgres://u@127.0.0.1:5432/')).toThrow(/не содержит имени/);
    expect(() => assertTestDatabase('не строка подключения')).toThrow(/не содержит имени/);
  });

  it('имя вынимается из строки подключения с параметрами и логином', () => {
    expect(databaseNameFromUrl('postgres://user:pass@host:5432/planner_test?sslmode=require')).toBe(
      'planner_test',
    );
  });
});
