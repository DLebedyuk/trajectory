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

/** Заглушка Google: сценарии синхронизации проверяются без сети. */
const fake = {
  revokeAccess: false,
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
      return { accessToken: 'access-token', expiresAt: new Date(Date.now() + 3600_000) };
    },
    listCalendars: async () => {
      if (fake.revokeAccess) throw new Revoked();
      return fake.calendars;
    },
    listEvents: async (_t: string, calendarExternalId: string) => {
      if (fake.revokeAccess) throw new Revoked();
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
  ({ GoogleAccessRevokedError: Revoked } =
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
