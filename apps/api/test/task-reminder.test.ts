import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let schema: typeof import('../src/db/schema.js');
let projectId = '';

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });

  const [direction] = await db
    .insert(schema.directions)
    .values({ userId: TEST_USER_ID, name: 'Вокал', color: '--d-voc' })
    .returning();
  const [project] = await db
    .insert(schema.projects)
    .values({
      userId: TEST_USER_ID,
      directionId: (direction as { id: string }).id,
      title: 'Разобрать программу',
    })
    .returning();
  projectId = (project as { id: string }).id;
}, 60_000);

afterAll(async () => {
  await client?.end();
});

async function collect(now: Date): Promise<string[]> {
  const { ReminderSchedulerService } =
    await import('../src/modules/reminders/reminder-scheduler.service.js');
  const sent: string[] = [];
  const provider = {
    channel: 'test',
    canDeliver: async () => true,
    send: async (n: { text: string }) => {
      sent.push(n.text);
    },
  };
  const scheduler = new ReminderSchedulerService(db as never, provider as never);
  await scheduler.processDue(now);
  return sent;
}

/** remindAt у задачи — обещание напомнить. Обещание должно выполняться. */
describe('напоминание по задаче (remindAt)', () => {
  it('в назначенный день напоминание по задаче доходит', async () => {
    await db.insert(schema.tasks).values({
      userId: TEST_USER_ID,
      projectId,
      title: 'Отправить запись педагогу',
      remindAt: '2026-09-20',
    });

    // задачи всегда уходят утром: 10:00 по Москве = 07:00 UTC
    const sent = await collect(new Date('2026-09-20T07:31:00.000Z'));
    expect(sent.join('\n')).toContain('Отправить запись педагогу');
  });

  it('не напоминает дважды за один день', async () => {
    const again = await collect(new Date('2026-09-20T08:00:00.000Z'));
    expect(again.join('\n')).not.toContain('Отправить запись педагогу');
  });

  it('не напоминает заранее', async () => {
    await db.insert(schema.tasks).values({
      userId: TEST_USER_ID,
      projectId,
      title: 'Забронировать студию',
      remindAt: '2026-10-05',
    });
    const sent = await collect(new Date('2026-09-21T07:31:00.000Z'));
    expect(sent.join('\n')).not.toContain('Забронировать студию');
  });

  it('не напоминает про выполненную задачу', async () => {
    await db.insert(schema.tasks).values({
      userId: TEST_USER_ID,
      projectId,
      title: 'Уже сделанное',
      remindAt: '2026-09-22',
      status: 'done',
      completedAt: new Date('2026-09-19T10:00:00.000Z'),
    });
    const sent = await collect(new Date('2026-09-22T07:31:00.000Z'));
    expect(sent.join('\n')).not.toContain('Уже сделанное');
  });
});
