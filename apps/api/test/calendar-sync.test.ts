import { beforeAll, beforeEach, describe, expect, it, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let schema: typeof import('../src/db/schema.js');
let CalendarService: typeof import('../src/modules/calendar/calendar.service.js').CalendarService;
let Revoked: typeof import('../src/modules/calendar/google-calendar.api.js').GoogleAccessRevokedError;
let ApiErr: typeof import('../src/modules/calendar/google-calendar.api.js').GoogleApiError;

/** Заглушка Google: сценарии синхронизации проверяются без сети. */
const fake = {
  revokeAccess: false,
  /** Отказ, не связанный с согласием: выключенный API, квота, сбой. */
  apiError: null as string | null,
  /** Календарь, на котором ломается загрузка событий: частичный сбой. */
  failEventsFor: null as string | null,
  calendars: [
    { externalId: 'primary@gmail.com', name: 'Личный', primary: true },
    { externalId: 'work@group.calendar', name: 'Работа', primary: false },
  ],
  events: [
    {
      externalId: 'ev-1',
      calendarExternalId: 'primary@gmail.com',
      title: 'Стоматолог',
      date: '2026-09-01',
      time: '17:30',
      duration: '40 мин',
      allDay: false,
    },
  ],
  refreshCalls: 0,
};

function makeApi() {
  return {
    refreshAccessToken: async () => {
      fake.refreshCalls += 1;
      if (fake.revokeAccess) throw new Revoked();
      if (fake.apiError) throw new ApiErr(fake.apiError);
      return { accessToken: 'access-token', expiresAt: new Date(Date.now() + 3600_000) };
    },
    listCalendars: async () => {
      if (fake.revokeAccess) throw new Revoked();
      if (fake.apiError) throw new ApiErr(fake.apiError);
      return fake.calendars;
    },
    listEvents: async (_t: string, calendarExternalId: string) => {
      if (fake.revokeAccess) throw new Revoked();
      if (fake.failEventsFor === calendarExternalId) throw new ApiErr('временный сбой');
      return fake.events.filter((e) => e.calendarExternalId === calendarExternalId);
    },
    revoke: async () => undefined,
  };
}

let service: InstanceType<typeof CalendarService>;

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });
  ({ CalendarService } = await import('../src/modules/calendar/calendar.service.js'));
  ({ GoogleAccessRevokedError: Revoked, GoogleApiError: ApiErr } =
    await import('../src/modules/calendar/google-calendar.api.js'));
  service = new CalendarService(db as never, makeApi() as never);
}, 60_000);

afterAll(async () => {
  await client?.end();
});

async function connect(refreshToken: string | null = 'refresh-1'): Promise<void> {
  await service.saveCredentials(TEST_USER_ID, {
    refreshToken,
    accessToken: 'access-token',
    expiresAt: new Date(Date.now() + 3600_000),
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
  });
}

beforeEach(async () => {
  fake.revokeAccess = false;
  fake.apiError = null;
  fake.failEventsFor = null;
  fake.refreshCalls = 0;
  await db.delete(schema.calendarEvents);
  await db.delete(schema.calendars);
  await db.delete(schema.googleCredentials);
});

describe('Google Calendar', () => {
  it('до подключения календарь не считается подключённым', async () => {
    const state = await service.connection(TEST_USER_ID);
    expect(state.connected).toBe(false);
  });

  it('refresh-токен не лежит в базе открытым', async () => {
    await connect('очень-секретный-токен');
    const [row] = await db
      .select()
      .from(schema.googleCredentials)
      .where(eq(schema.googleCredentials.userId, TEST_USER_ID));
    expect(row?.refreshTokenEnc).not.toContain('очень-секретный-токен');
    expect((await service.connection(TEST_USER_ID)).connected).toBe(true);
  });

  it('синхронизация приносит календари и события', async () => {
    await connect();
    const result = await service.sync(TEST_USER_ID);
    expect(result.calendars).toBe(2);

    const list = await service.listCalendars(TEST_USER_ID);
    expect(list.map((c) => c.name).sort()).toEqual(['Личный', 'Работа']);
  });

  it('по умолчанию включён только основной календарь', async () => {
    await connect();
    await service.sync(TEST_USER_ID);
    const list = await service.listCalendars(TEST_USER_ID);
    expect(list.find((c) => c.name === 'Личный')?.enabled).toBe(true);
    expect(list.find((c) => c.name === 'Работа')?.enabled).toBe(false);
  });

  it('повторная синхронизация не создаёт дублей', async () => {
    await connect();
    await service.sync(TEST_USER_ID);
    await service.sync(TEST_USER_ID);
    await service.sync(TEST_USER_ID);

    const cals = await db.select().from(schema.calendars);
    const events = await db.select().from(schema.calendarEvents);
    expect(cals).toHaveLength(2);
    expect(events).toHaveLength(1);
  });

  it('изменение события обновляет запись, а не добавляет вторую', async () => {
    await connect();
    await service.sync(TEST_USER_ID);
    fake.events[0]!.title = 'Стоматолог перенесён';
    fake.events[0]!.time = '19:00';
    await service.sync(TEST_USER_ID);

    const events = await db.select().from(schema.calendarEvents);
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe('Стоматолог перенесён');
    expect(events[0]?.time).toBe('19:00');
    fake.events[0]!.title = 'Стоматолог';
    fake.events[0]!.time = '17:30';
  });

  it('выбор пользователя переживает синхронизацию', async () => {
    await connect();
    await service.sync(TEST_USER_ID);
    const list = await service.listCalendars(TEST_USER_ID);
    const work = list.find((c) => c.name === 'Работа');
    await service.setEnabled(TEST_USER_ID, work?.id as string, true);

    await service.sync(TEST_USER_ID);
    const after = await service.listCalendars(TEST_USER_ID);
    expect(after.find((c) => c.name === 'Работа')?.enabled).toBe(true);
  });

  it('отозванный доступ виден в состоянии, а не падает молча', async () => {
    await connect();
    await service.sync(TEST_USER_ID);

    fake.revokeAccess = true;
    await db
      .update(schema.googleCredentials)
      .set({ accessTokenExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.googleCredentials.userId, TEST_USER_ID));

    await expect(service.sync(TEST_USER_ID)).rejects.toThrow();
    const state = await service.connection(TEST_USER_ID);
    expect(state.revoked).toBe(true);
    expect(state.connected).toBe(false);
  });

  it('текст отказа от Google сохраняется, а не заменяется общей фразой', async () => {
    await connect();
    fake.revokeAccess = true;
    await db
      .update(schema.googleCredentials)
      .set({ accessTokenExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.googleCredentials.userId, TEST_USER_ID));

    await expect(service.sync(TEST_USER_ID)).rejects.toThrow();
    const [row] = await db
      .select()
      .from(schema.googleCredentials)
      .where(eq(schema.googleCredentials.userId, TEST_USER_ID));
    expect(row?.lastError).toBeTruthy();
  });

  /**
   * Ровно этот случай сломал живое подключение: в проекте Google Cloud не был
   * включён Calendar API, Google ответил 403, а мы погасили доступ и показали
   * «отозван». Переподключение такое не чинит — гасить доступ здесь нельзя.
   */
  it('403 без отзыва не гасит подключение, но виден в состоянии', async () => {
    await connect();
    fake.apiError = 'Google Calendar API has not been used in project 123 before or it is disabled';

    await expect(service.sync(TEST_USER_ID)).rejects.toThrow();

    const state = await service.connection(TEST_USER_ID);
    expect(state.revoked).toBe(false);
    expect(state.connected).toBe(true);
    expect(state.lastError).toMatch(/has not been used/);
  });

  it('после починки на стороне Google синхронизация проходит, ошибка гаснет', async () => {
    await connect();
    fake.apiError = 'quota exceeded';
    await expect(service.sync(TEST_USER_ID)).rejects.toThrow();

    fake.apiError = null;
    await service.sync(TEST_USER_ID);
    const state = await service.connection(TEST_USER_ID);
    expect(state.lastError).toBeNull();
    expect(state.lastSyncAt).not.toBeNull();
  });

  it('удалённое в Google событие исчезает и у нас', async () => {
    await connect();
    await service.sync(TEST_USER_ID);
    expect(await db.select().from(schema.calendarEvents)).toHaveLength(1);

    const kept = fake.events;
    fake.events = [];
    const result = await service.sync(TEST_USER_ID);
    fake.events = kept;

    expect(result.removed).toBe(1);
    expect(await db.select().from(schema.calendarEvents)).toHaveLength(0);
  });

  it('исчезнувший у Google календарь убирается вместе с событиями', async () => {
    await connect();
    await service.sync(TEST_USER_ID);
    const before = await service.listCalendars(TEST_USER_ID);
    expect(before).toHaveLength(2);

    const all = fake.calendars;
    fake.calendars = all.filter((c) => c.externalId !== 'work@group.calendar');
    await service.sync(TEST_USER_ID);
    fake.calendars = all;

    const after = await service.listCalendars(TEST_USER_ID);
    expect(after.map((c) => c.name)).toEqual(['Личный']);
  });

  /**
   * Частично провалившийся прогон раньше засчитывался как полностью успешный:
   * lastError затирался, и человек видел «синхронизировано» поверх неполного
   * календаря.
   */
  it('частичный сбой виден в результате и не затирает ошибку', async () => {
    await connect();
    await service.sync(TEST_USER_ID);
    const list = await service.listCalendars(TEST_USER_ID);
    const work = list.find((c) => c.name === 'Работа');
    await service.setEnabled(TEST_USER_ID, work?.id as string, true);

    fake.failEventsFor = 'work@group.calendar';
    const result = await service.sync(TEST_USER_ID);

    expect(result.partial).toBe(true);
    expect(result.failed).toContain('Работа');
    const state = await service.connection(TEST_USER_ID);
    expect(state.lastError).toMatch(/Работа/);
    // доступ при этом жив: сбой одного календаря — не повод гасить подключение
    expect(state.revoked).toBe(false);
    // событие из рабочего календаря не появилось, но личный не пострадал
    expect(await db.select().from(schema.calendarEvents)).toHaveLength(1);
  });

  it('сбойный календарь не теряет уже загруженные события', async () => {
    await connect();
    await service.sync(TEST_USER_ID);
    fake.failEventsFor = 'primary@gmail.com';
    const result = await service.sync(TEST_USER_ID);

    expect(result.partial).toBe(true);
    // чистка удалённых работает только для календарей, догрузившихся целиком
    expect(await db.select().from(schema.calendarEvents)).toHaveLength(1);
  });

  it('повторное подключение без нового refresh-токена сохраняет прежний', async () => {
    await connect('первый-токен');
    await connect(null);
    const state = await service.connection(TEST_USER_ID);
    expect(state.connected).toBe(true);
    expect(state.revoked).toBe(false);
  });

  it('первое подключение без refresh-токена отвергается понятной ошибкой', async () => {
    // у ApiException текст лежит в теле ответа, а не в message
    const err = await connect(null).catch((e: { getResponse?: () => unknown }) => e);
    const body = (err as { getResponse: () => { error: { message: string } } }).getResponse();
    expect(body.error.message).toMatch(/refresh-токен/i);
  });

  it('отключение убирает доступ, календари и события', async () => {
    await connect();
    await service.sync(TEST_USER_ID);
    await service.disconnect(TEST_USER_ID);

    expect((await service.connection(TEST_USER_ID)).connected).toBe(false);
    expect(await db.select().from(schema.calendars)).toHaveLength(0);
    expect(await db.select().from(schema.calendarEvents)).toHaveLength(0);
  });

  it('живой access-токен не обновляется на каждый запрос', async () => {
    await connect();
    await service.sync(TEST_USER_ID);
    await service.sync(TEST_USER_ID);
    expect(fake.refreshCalls).toBe(0);
  });
});
