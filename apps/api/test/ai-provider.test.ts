import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TEST_DB_URL } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_MODE = 'off';
process.env.AI_PROVIDER = 'openai';
process.env.AI_API_KEY = 'test-key';
process.env.AI_BASE_URL = 'https://ai.test/v1';
process.env.AI_MODEL = 'test-model';
process.env.AI_TIMEOUT_MS = '300';

let OpenAiProvider: typeof import('../src/modules/inbox/openai.provider.js').OpenAiProvider;
let MockAiProvider: typeof import('../src/modules/inbox/ai.provider.js').MockAiProvider;

const ITEMS = [
  { id: 'item-1', originalText: 'Записаться на английский на субботу' },
  { id: 'item-2', originalText: 'Посмотреть спектакль в Практике' },
];
const CTX = {
  today: '2026-09-01',
  projects: [{ id: 'proj-1', title: 'Занятия с Джоном', directionName: 'Английский' }],
};

beforeAll(async () => {
  ({ OpenAiProvider } = await import('../src/modules/inbox/openai.provider.js'));
  ({ MockAiProvider } = await import('../src/modules/inbox/ai.provider.js'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function make() {
  return new OpenAiProvider(new MockAiProvider());
}

/** Ответ провайдера в формате OpenAI chat/completions. */
function reply(content: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
  };
}

describe('разбор входящих через ИИ', () => {
  it('ключ уходит в заголовке и не подмешивается в текст запроса', async () => {
    let seen: { headers: Record<string, string>; body: string } | null = null;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen = {
        headers: init.headers as Record<string, string>,
        body: String(init.body),
      };
      return reply({ items: [] });
    });

    await make().propose(ITEMS, CTX);
    expect(seen!.headers.Authorization).toBe('Bearer test-key');
    expect(seen!.body).not.toContain('test-key');
  });

  it('корректный ответ превращается в предложения', async () => {
    vi.stubGlobal('fetch', async () =>
      reply({
        items: [
          {
            inboxItemId: 'item-1',
            type: 'task',
            text: 'Записаться на английский',
            projectId: 'proj-1',
            deadline: '2026-09-05',
            remindAt: null,
            estimatedDuration: 'short',
            comment: null,
            note: null,
          },
          {
            inboxItemId: 'item-2',
            type: 'menu',
            text: 'Спектакль в Практике',
            projectId: null,
            deadline: null,
            remindAt: null,
            estimatedDuration: null,
            comment: null,
            note: null,
          },
        ],
      }),
    );

    const out = await make().propose(ITEMS, CTX);
    expect(out).toHaveLength(2);
    expect(out[0]?.type).toBe('task');
    expect(out[0]?.projectId).toBe('proj-1');
    expect(out[0]?.deadline).toBe('2026-09-05');
    expect(out[1]?.type).toBe('menu');
  });

  it('выдуманный id проекта отбрасывается, а человек предупреждён', async () => {
    vi.stubGlobal('fetch', async () =>
      reply({
        items: [
          {
            inboxItemId: 'item-1',
            type: 'task',
            text: 'Записаться на английский',
            projectId: 'проект-которого-нет',
            deadline: null,
            remindAt: null,
            estimatedDuration: null,
            comment: null,
            note: null,
          },
        ],
      }),
    );

    const out = await make().propose([ITEMS[0]!], CTX);
    expect(out[0]?.projectId).toBeNull();
    expect(out[0]?.note).toMatch(/не распознан/i);
  });

  it('невалидная дата не проходит схему — уходим на правила, текст цел', async () => {
    vi.stubGlobal('fetch', async () =>
      reply({
        items: [
          {
            inboxItemId: 'item-1',
            type: 'task',
            text: 'Записаться',
            projectId: null,
            deadline: 'в следующий вторник',
            remindAt: null,
            estimatedDuration: null,
            comment: null,
            note: null,
          },
        ],
      }),
    );

    const out = await make().propose([ITEMS[0]!], CTX);
    expect(out).toHaveLength(1);
    expect(out[0]?.note).toMatch(/ИИ недоступен/);
    expect(out[0]?.inboxItemId).toBe('item-1');
  });

  it('не-JSON в ответе не роняет разбор', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'извини, не смогла' } }] }),
    }));

    const out = await make().propose(ITEMS, CTX);
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.text.length > 0)).toBe(true);
  });

  it('таймаут не теряет входящие', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const out = await make().propose(ITEMS, CTX);
    expect(out).toHaveLength(2);
    expect(out[0]?.note).toMatch(/ИИ недоступен/);
  });

  it('недоступный провайдер не роняет разбор', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const out = await make().propose(ITEMS, CTX);
    expect(out).toHaveLength(2);
  });

  it('запись, о которой ИИ промолчал, остаётся во входящих', async () => {
    vi.stubGlobal('fetch', async () =>
      reply({
        items: [
          {
            inboxItemId: 'item-1',
            type: 'task',
            text: 'Записаться',
            projectId: null,
            deadline: null,
            remindAt: null,
            estimatedDuration: null,
            comment: null,
            note: null,
          },
        ],
      }),
    );

    const out = await make().propose(ITEMS, CTX);
    expect(out).toHaveLength(2);
    const second = out.find((p) => p.inboxItemId === 'item-2');
    expect(second?.type).toBe('keep');
    expect(second?.text).toBe('Посмотреть спектакль в Практике');
  });

  it('пустой список не ходит в сеть', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const out = await make().propose([], CTX);
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
