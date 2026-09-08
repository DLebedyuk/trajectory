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
let tasksService: import('../src/modules/tasks/tasks.service.js').TasksService;
let projectId = '';

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });

  const { TasksService } = await import('../src/modules/tasks/tasks.service.js');
  const { FocusService } = await import('../src/modules/focus/focus.service.js');
  const { TouchesService } = await import('../src/modules/touches/touches.service.js');
  tasksService = new TasksService(
    db as never,
    new FocusService(db as never) as never,
    new TouchesService(db as never) as never,
  );

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

/**
 * Задачи всегда напоминают в утреннем слоте, а он формируется один раз в день
 * (idempotency key планировщика). Если поставить remindAt=сегодня уже после того,
 * как сегодняшний утренний слот ушёл, задача физически не попадёт в уже отправленный
 * бакет — раньше она терялась молча. TasksService.create/update теперь сами
 * переносят такой remindAt на завтра, где сработает обычный утренний слот.
 */
describe('remindAt=сегодня после уже отправленного утреннего слота', () => {
  it('переносится на завтра и доходит там, а не теряется', async () => {
    // сначала утренний слот 25 сентября реально уходит — на другой задаче
    await db.insert(schema.tasks).values({
      userId: TEST_USER_ID,
      projectId,
      title: 'Подтвердить площадку',
      remindAt: '2026-09-25',
    });
    const morning = await collect(new Date('2026-09-25T07:31:00.000Z')); // 10:31 MSK
    expect(morning.join('\n')).toContain('Подтвердить площадку');

    // в 13:00 MSK того же дня создаём вторую задачу на сегодня — слот уже ушёл
    const created = await tasksService.create(
      TEST_USER_ID,
      { projectId, title: 'Отправить фото афиши', remindAt: '2026-09-25', pinned: false },
      new Date('2026-09-25T10:00:00.000Z'),
    );
    expect(created.remindAt).toBe('2026-09-26');

    // в оставшиеся проходы того же дня она никуда не уходит...
    const sameDayAgain = await collect(new Date('2026-09-25T15:00:00.000Z'));
    expect(sameDayAgain.join('\n')).not.toContain('Отправить фото афиши');

    // ...а на следующее утро приходит как обычно
    const nextMorning = await collect(new Date('2026-09-26T07:31:00.000Z'));
    expect(nextMorning.join('\n')).toContain('Отправить фото афиши');
  });

  it('update тоже переносит remindAt, поставленный после ушедшего слота', async () => {
    const [row] = await db
      .insert(schema.tasks)
      .values({ userId: TEST_USER_ID, projectId, title: 'Забрать реквизит' })
      .returning();

    // 27 сентября, 12:00 MSK — утренний слот (10:00) уже прошёл
    const updated = await tasksService.update(
      TEST_USER_ID,
      (row as { id: string }).id,
      { remindAt: '2026-09-27' },
      new Date('2026-09-27T09:00:00.000Z'),
    );
    expect(updated.remindAt).toBe('2026-09-28');
  });
});
