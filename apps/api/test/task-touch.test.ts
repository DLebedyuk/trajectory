import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let schema: typeof import('../src/db/schema.js');
let tasksService: import('../src/modules/tasks/tasks.service.js').TasksService;
let projects: import('../src/modules/projects/projects.service.js').ProjectsService;

let directionId = '';
let projectId = '';

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });

  const { TasksService } = await import('../src/modules/tasks/tasks.service.js');
  const { FocusService } = await import('../src/modules/focus/focus.service.js');
  const { TouchesService } = await import('../src/modules/touches/touches.service.js');
  const { ProjectsService } = await import('../src/modules/projects/projects.service.js');
  tasksService = new TasksService(
    db as never,
    new FocusService(db as never) as never,
    new TouchesService(db as never) as never,
  );
  projects = new ProjectsService(db as never);
}, 60_000);

afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await db.delete(schema.touches);
  await db.delete(schema.tasks);
  await db.delete(schema.projects);
  await db.delete(schema.directions);
  const [dir] = await db
    .insert(schema.directions)
    .values({ userId: TEST_USER_ID, name: 'Озвучка', color: '--d-act', sortOrder: 0 })
    .returning();
  directionId = dir!.id;
  const project = await projects.create(TEST_USER_ID, {
    directionId,
    title: 'Демо-ролик',
    status: 'active',
    notes: [],
  });
  projectId = project.id;
});

const makeTask = (title = 'Записать дубль'): Promise<{ id: string }> =>
  tasksService.create(TEST_USER_ID, { projectId, title, pinned: false });

const touches = () => db.select().from(schema.touches);

/**
 * Закрытая задача — такое же занятие, как записанное руками касание, просто
 * запланированное. Но решение принимается в момент закрытия: не всякая задача
 * оказывается занятием.
 */
describe('касание из закрытой задачи', () => {
  it('без подтверждения касание не появляется', async () => {
    const task = await makeTask();
    await tasksService.complete(TEST_USER_ID, task.id);
    expect(await touches()).toHaveLength(0);
  });

  it('с подтверждением появляется касание с направлением задачи', async () => {
    const task = await makeTask('Прогнать текст');
    await tasksService.complete(TEST_USER_ID, task.id, true);
    const rows = await touches();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taskId: task.id,
      directionId,
      projectId,
      title: 'Прогнать текст',
    });
  });

  it('повторное закрытие не плодит дубли', async () => {
    const task = await makeTask();
    await tasksService.complete(TEST_USER_ID, task.id, true);
    await tasksService.complete(TEST_USER_ID, task.id, true);
    expect(await touches()).toHaveLength(1);
  });

  it('возврат задачи в открытые убирает касание', async () => {
    const task = await makeTask();
    await tasksService.complete(TEST_USER_ID, task.id, true);
    await tasksService.reopen(TEST_USER_ID, task.id);
    expect(await touches()).toHaveLength(0);
  });

  it('удаление задачи уносит касание за собой', async () => {
    const task = await makeTask();
    await tasksService.complete(TEST_USER_ID, task.id, true);
    await tasksService.remove(TEST_USER_ID, task.id);
    expect(await touches()).toHaveLength(0);
  });

  /**
   * Завершение проекта закрывает его задачи пачкой. Это уборка, а не занятие:
   * один клик не должен рисовать в карте день, в который ничего не делали.
   */
  it('завершение проекта не создаёт касаний', async () => {
    await makeTask('Первая');
    await makeTask('Вторая');
    await projects.complete(TEST_USER_ID, projectId);
    expect(await touches()).toHaveLength(0);
    const open = await db.select().from(schema.tasks).where(eq(schema.tasks.status, 'open'));
    expect(open).toHaveLength(0);
  });
});
