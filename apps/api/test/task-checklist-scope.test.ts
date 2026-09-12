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

/*
 * attachChecklists() раньше вытягивал пункты чек-листов вообще без WHERE —
 * весь task_checklist_items целиком, всех пользователей — и уже потом
 * фильтровал в памяти по id задач текущей страницы. Само сопоставление
 * пункт → задача не ломалось (фильтрация в JS была верной), поэтому здесь
 * фиксируем именно это: после того как выборку ограничили нужными id задач
 * в SQL, чек-лист каждой задачи по-прежнему приезжает целиком и не путается
 * с чек-листом соседней задачи в том же проекте.
 */
describe('чек-листы задач привязаны к своей задаче', () => {
  it('listByProject возвращает каждой задаче ровно её собственный чек-лист', async () => {
    const taskA = await tasksService.create(TEST_USER_ID, {
      projectId,
      title: 'Записать дубль А',
      pinned: false,
    });
    const taskB = await tasksService.create(TEST_USER_ID, {
      projectId,
      title: 'Записать дубль Б',
      pinned: false,
    });

    await db.insert(schema.taskChecklistItems).values([
      { taskId: taskA.id, text: 'Пункт А1', sortOrder: 0 },
      { taskId: taskA.id, text: 'Пункт А2', sortOrder: 1 },
      { taskId: taskB.id, text: 'Пункт Б1', sortOrder: 0 },
    ]);

    const list = await tasksService.listByProject(TEST_USER_ID, projectId);
    const foundA = list.find((t) => t.id === taskA.id);
    const foundB = list.find((t) => t.id === taskB.id);

    expect(foundA?.checklist.map((c) => c.text)).toEqual(['Пункт А1', 'Пункт А2']);
    expect(foundB?.checklist.map((c) => c.text)).toEqual(['Пункт Б1']);
  });

  it('задача без пунктов получает пустой чек-лист, а не чужие пункты', async () => {
    const task = await tasksService.create(TEST_USER_ID, {
      projectId,
      title: 'Без чек-листа',
      pinned: false,
    });

    const list = await tasksService.listByProject(TEST_USER_ID, projectId);
    const found = list.find((t) => t.id === task.id);
    expect(found?.checklist).toEqual([]);
  });
});
