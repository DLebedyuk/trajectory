import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TEST_DB_URL } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_MODE = 'off';

let RealGoogleCalendarApi: typeof import('../src/modules/calendar/google-calendar.api.js').RealGoogleCalendarApi;
let GoogleAccessRevokedError: typeof import('../src/modules/calendar/google-calendar.api.js').GoogleAccessRevokedError;
let GoogleApiError: typeof import('../src/modules/calendar/google-calendar.api.js').GoogleApiError;

beforeAll(async () => {
  ({ RealGoogleCalendarApi, GoogleAccessRevokedError, GoogleApiError } =
    await import('../src/modules/calendar/google-calendar.api.js'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number, body: unknown) => ({ ok: false, status, json: async () => body });

const RANGE = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-30T00:00:00Z') };

describe('клиент Google Calendar', () => {
  it('идёт по всем страницам списка календарей', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      seen.push(url);
      if (url.includes('pageToken=page2')) {
        return ok({ items: [{ id: 'b@g', summary: 'Второй' }] });
      }
      return ok({ items: [{ id: 'a@g', summary: 'Первый' }], nextPageToken: 'page2' });
    });

    const out = await new RealGoogleCalendarApi().listCalendars('token');
    expect(out.map((c) => c.name)).toEqual(['Первый', 'Второй']);
    expect(seen).toHaveLength(2);
  });

  /**
   * Раньше клиент брал только первые 250 событий. Это было не просто «меньше
   * данных»: после появления чистки удалённых всё, что не влезло на первую
   * страницу, считалось бы стёртым в Google и удалялось бы у нас.
   */
  it('идёт по всем страницам событий', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('pageToken=next')) {
        return ok({
          items: [
            {
              id: 'ev-2',
              summary: 'Вторая страница',
              start: { dateTime: '2026-09-10T12:00:00Z' },
              end: { dateTime: '2026-09-10T13:00:00Z' },
            },
          ],
        });
      }
      return ok({
        items: [
          {
            id: 'ev-1',
            summary: 'Первая страница',
            start: { dateTime: '2026-09-09T12:00:00Z' },
            end: { dateTime: '2026-09-09T13:00:00Z' },
          },
        ],
        nextPageToken: 'next',
      });
    });

    const out = await new RealGoogleCalendarApi().listEvents('token', 'a@g', RANGE, 'UTC');
    expect(out.map((e) => e.externalId)).toEqual(['ev-1', 'ev-2']);
  });

  it('401 — это отзыв доступа', async () => {
    vi.stubGlobal('fetch', async () =>
      fail(401, { error: { message: 'Invalid Credentials', status: 'UNAUTHENTICATED' } }),
    );
    await expect(new RealGoogleCalendarApi().listCalendars('token')).rejects.toBeInstanceOf(
      GoogleAccessRevokedError,
    );
  });

  it('403 из-за выключенного в проекте API — не отзыв', async () => {
    vi.stubGlobal('fetch', async () =>
      fail(403, {
        error: {
          message: 'Google Calendar API has not been used in project 1 before or it is disabled',
          errors: [{ reason: 'accessNotConfigured' }],
        },
      }),
    );
    const api = new RealGoogleCalendarApi();
    await expect(api.listCalendars('token')).rejects.toBeInstanceOf(GoogleApiError);
    await expect(api.listCalendars('token')).rejects.toThrow(/has not been used/);
  });

  it('403 из-за нехватки прав — отзыв: помогает только переподключение', async () => {
    vi.stubGlobal('fetch', async () =>
      fail(403, {
        error: {
          message: 'Request had insufficient authentication scopes.',
          errors: [{ reason: 'insufficientPermissions' }],
        },
      }),
    );
    await expect(new RealGoogleCalendarApi().listCalendars('token')).rejects.toBeInstanceOf(
      GoogleAccessRevokedError,
    );
  });

  it('invalid_grant при обновлении токена — отзыв, прочие 400 — нет', async () => {
    const api = new RealGoogleCalendarApi();

    vi.stubGlobal('fetch', async () => fail(400, { error: 'invalid_grant' }));
    await expect(api.refreshAccessToken('r')).rejects.toBeInstanceOf(GoogleAccessRevokedError);

    vi.stubGlobal('fetch', async () =>
      fail(400, { error: 'invalid_client', error_description: 'Unauthorized' }),
    );
    await expect(api.refreshAccessToken('r')).rejects.toBeInstanceOf(GoogleApiError);
  });
});
