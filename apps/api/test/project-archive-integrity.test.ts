import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { updateProjectSchema } from '@planner/contracts';
import { prepareDatabase, TEST_DB_URL, TEST_USER_ID } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let schema: typeof import('../src/db/schema.js');
let projects: import('../src/modules/projects/projects.service.js').ProjectsService;
let tasksService: import('../src/modules/tasks/tasks.service.js').TasksService;

let directionId = '';

beforeAll(async () => {
  await prepareDatabase();
  schema = await import('../src/db/schema.js');
  client = postgres(TEST_DB_URL, { max: 2 });
  db = drizzle(client, { schema });

  const { ProjectsService } = await import('../src/modules/projects/projects.service.js');
  const { TasksService } = await import('../src/modules/tasks/tasks.service.js');
  const { FocusService } = await import('../src/modules/focus/focus.service.js');
  const { TouchesService } = await import('../src/modules/touches/touches.service.js');
  projects = new ProjectsService(db as never);
  tasksService = new TasksService(
    db as never,
    new FocusService(db as never) as never,
    new TouchesService(db as never) as never,
  );
}, 60_000);

afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await db.delete(schema.tasks);
  await db.delete(schema.projects);
  await db.delete(schema.directions);
  const [dir] = await db
    .insert(schema.directions)
    .values({ userId: TEST_USER_ID, name: 'Актёрство', color: '--c1', sortOrder: 0 })
    .returning();
  directionId = dir!.id;
});

async function makeProject() {
  return projects.create(TEST_USER_ID, {
    directionId,
    title: 'Демо-озвучка',
    status: 'active',
    notes: [],
  });
}

/**
 * Завершение проекта — не правка поля: вместе со статусом закрываются задачи
 * и снимается фокус. Через общий PATCH это обходилось, и проект оказывался
 * «завершённым» с живыми открытыми задачами внутри.
 */
describe('целостность архива проектов', () => {
  it('общий PATCH не принимает статус', () => {
    const parsed = updateProjectSchema.safeParse({ title: 'Новое имя', status: 'archived' });
    expect(parsed.success).toBe(false);
  });

  it('завершение проекта закрывает его открытые задачи', async () => {
    const project = await makeProject();
    await tasksService.create(TEST_USER_ID, {
      projectId: project.id,
      title: 'Записать дубль',
      pinned: false,
    });

    await projects.complete(TEST_USER_ID, project.id);

    const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.projectId, project.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((t) => t.status !== 'open')).toBe(true);
  });

  it('задачу нельзя оживить внутри завершённого проекта', async () => {
    const project = await makeProject();
    const task = await tasksService.create(TEST_USER_ID, {
      projectId: project.id,
      title: 'Записать дубль',
      pinned: false,
    });
    await projects.complete(TEST_USER_ID, project.id);

    await expect(tasksService.reopen(TEST_USER_ID, task.id)).rejects.toThrow();

    const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id));
    expect(row?.status).not.toBe('open');
  });

  it('после возврата проекта задачу оживить можно', async () => {
    const project = await makeProject();
    const task = await tasksService.create(TEST_USER_ID, {
      projectId: project.id,
      title: 'Записать дубль',
      pinned: false,
    });
    await projects.complete(TEST_USER_ID, project.id);
    await projects.resume(TEST_USER_ID, project.id);

    const reopened = await tasksService.reopen(TEST_USER_ID, task.id);
    expect(reopened.status).toBe('open');
  });

  /*
   * complete() пишет в tasks, user_focus и projects тремя отдельными
   * запросами внутри одной транзакции — проверяем, что все три изменения
   * реально происходят вместе за один вызов.
   */
  it('завершение проекта архивирует его и снимает фокус с его же активной задачи', async () => {
    const project = await makeProject();
    const task = await tasksService.create(TEST_USER_ID, {
      projectId: project.id,
      title: 'Записать дубль',
      pinned: false,
    });
    await db
      .update(schema.userFocus)
      .set({ activeTaskId: task.id })
      .where(eq(schema.userFocus.userId, TEST_USER_ID));

    const completed = await projects.complete(TEST_USER_ID, project.id);

    expect(completed.status).toBe('archived');
    expect(completed.pinned).toBe(false);
    expect(completed.completedAt).not.toBeNull();

    const [focus] = await db
      .select()
      .from(schema.userFocus)
      .where(eq(schema.userFocus.userId, TEST_USER_ID));
    expect(focus?.activeTaskId).toBeNull();
  });

  it('завершение проекта не трогает активную задачу из другого проекта', async () => {
    const project = await makeProject();
    const otherProject = await projects.create(TEST_USER_ID, {
      directionId,
      title: 'Другой проект',
      status: 'active',
      notes: [],
    });
    const otherTask = await tasksService.create(TEST_USER_ID, {
      projectId: otherProject.id,
      title: 'Задача из другого проекта',
      pinned: false,
    });
    await db
      .update(schema.userFocus)
      .set({ activeTaskId: otherTask.id })
      .where(eq(schema.userFocus.userId, TEST_USER_ID));

    await projects.complete(TEST_USER_ID, project.id);

    const [focus] = await db
      .select()
      .from(schema.userFocus)
      .where(eq(schema.userFocus.userId, TEST_USER_ID));
    expect(focus?.activeTaskId).toBe(otherTask.id);
  });
});
