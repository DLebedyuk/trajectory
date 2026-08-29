import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm';
import type {
  CreateTaskInput,
  Task,
  TaskFilter,
  TaskWithContext,
  UpdateTaskInput,
} from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import { directions, projects, taskChecklistItems, tasks } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { dateOnly, iso, isoRequired } from '../../common/mappers.js';
import { FocusService } from '../focus/focus.service.js';

type Row = typeof tasks.$inferSelect;

const toTask = (r: Row, checklist: Task['checklist'] = []): Task => ({
  id: r.id,
  userId: r.userId,
  projectId: r.projectId,
  title: r.title,
  status: r.status as Task['status'],
  pinned: r.pinned,
  deadline: dateOnly(r.deadline),
  exactTime: r.exactTime,
  estimatedDuration: r.estimatedDuration as Task['estimatedDuration'],
  remindAt: dateOnly(r.remindAt),
  comment: r.comment,
  sortOrder: r.sortOrder,
  createdAt: isoRequired(r.createdAt),
  completedAt: iso(r.completedAt),
  updatedAt: isoRequired(r.updatedAt),
  checklist,
});

@Injectable()
export class TasksService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(FocusService) private readonly focus: FocusService,
  ) {}

  async listByProject(userId: string, projectId: string, filter: TaskFilter = {}): Promise<Task[]> {
    const conditions = [eq(tasks.userId, userId), eq(tasks.projectId, projectId)];
    conditions.push(eq(tasks.status, filter.status ?? 'open'));
    if (filter.estimatedDuration)
      conditions.push(eq(tasks.estimatedDuration, filter.estimatedDuration));
    if (filter.withDeadlineOnly) conditions.push(isNotNull(tasks.deadline));

    const order =
      filter.sort === 'deadline'
        ? [sql`${tasks.deadline} asc nulls last`, asc(tasks.sortOrder)]
        : filter.sort === 'pinned'
          ? [desc(tasks.pinned), asc(tasks.sortOrder)]
          : [asc(tasks.sortOrder), asc(tasks.createdAt)];

    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(...order);
    return this.attachChecklists(rows);
  }

  private async attachChecklists(rows: Row[]): Promise<Task[]> {
    if (rows.length === 0) return [];
    const items = await this.db
      .select()
      .from(taskChecklistItems)
      .orderBy(taskChecklistItems.sortOrder);
    const byTask = new Map<string, Task['checklist']>();
    for (const i of items) {
      if (!byTask.has(i.taskId)) byTask.set(i.taskId, []);
      byTask.get(i.taskId)?.push({
        id: i.id,
        taskId: i.taskId,
        text: i.text,
        completed: i.completed,
        sortOrder: i.sortOrder,
      });
    }
    return rows.map((r) => toTask(r, byTask.get(r.id) ?? []));
  }

  async get(userId: string, id: string): Promise<TaskWithContext> {
    const task = await this.focus.loadTaskWithContext(userId, id);
    if (!task) throw ApiException.notFound('Задача');
    return task;
  }

  /** Закреплённые открытые задачи пользователя вместе с проектом и направлением. */
  async listPinned(userId: string, directionId?: string): Promise<TaskWithContext[]> {
    const conditions = [eq(tasks.userId, userId), eq(tasks.pinned, true), eq(tasks.status, 'open')];
    if (directionId) conditions.push(eq(projects.directionId, directionId));
    const rows = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(...conditions))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt));
    const result: TaskWithContext[] = [];
    for (const r of rows) {
      const t = await this.focus.loadTaskWithContext(userId, r.id);
      if (t) result.push(t);
    }
    return result;
  }

  /** Задачи с дедлайном ровно на этот день — для блока «Сегодня». */
  listDue(userId: string, date: string): Promise<TaskWithContext[]> {
    return this.byDeadline(userId, sql`${tasks.deadline} = ${date}`);
  }

  /**
   * Просроченное отдельным списком. Главная не должна начинаться с хвоста
   * несделанного: приложение считает пройденное, а не оставшееся.
   */
  listOverdue(userId: string, date: string): Promise<TaskWithContext[]> {
    return this.byDeadline(userId, sql`${tasks.deadline} < ${date}`);
  }

  private async byDeadline(userId: string, condition: SQL): Promise<TaskWithContext[]> {
    const rows = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, 'open'),
          isNotNull(tasks.deadline),
          condition,
        ),
      )
      .orderBy(asc(tasks.exactTime), asc(tasks.deadline));
    const result: TaskWithContext[] = [];
    for (const r of rows) {
      const t = await this.focus.loadTaskWithContext(userId, r.id);
      if (t) result.push(t);
    }
    return result;
  }

  /**
   * Завершённые задачи всех проектов направления — архив направления.
   * Проект у каждой задачи виден, иначе список превращается в кашу.
   */
  async listDoneByDirection(userId: string, directionId: string): Promise<TaskWithContext[]> {
    const rows = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          eq(tasks.userId, userId),
          eq(tasks.status, 'done'),
          eq(projects.directionId, directionId),
        ),
      )
      .orderBy(desc(tasks.completedAt));
    const result: TaskWithContext[] = [];
    for (const r of rows) {
      const t = await this.focus.loadTaskWithContext(userId, r.id);
      if (t) result.push(t);
    }
    return result;
  }

  async create(userId: string, input: CreateTaskInput): Promise<Task> {
    const [project] = await this.db
      .select({ id: projects.id, status: projects.status })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, input.projectId)));
    if (!project) throw ApiException.notFound('Проект');
    // завершённый проект закрыт: иначе задача попадает в архив и там теряется
    if (project.status === 'archived') {
      throw ApiException.conflict(
        'project_archived',
        'Проект завершён. Верните его из архива или выберите другой.',
      );
    }

    const [{ value } = { value: 0 }] = await this.db
      .select({ value: sql<number>`coalesce(max(${tasks.sortOrder}), -1) + 1` })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.projectId, input.projectId)));

    const [row] = await this.db
      .insert(tasks)
      .values({
        userId,
        projectId: input.projectId,
        title: input.title,
        deadline: input.deadline ?? null,
        exactTime: input.exactTime ?? null,
        estimatedDuration: input.estimatedDuration ?? null,
        remindAt: input.remindAt ?? null,
        comment: input.comment ?? null,
        pinned: input.pinned,
        sortOrder: Number(value),
      })
      .returning();
    return toTask(row as Row);
  }

  async update(userId: string, id: string, input: UpdateTaskInput): Promise<Task> {
    await this.assertExists(userId, id);
    const [row] = await this.db
      .update(tasks)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.deadline !== undefined ? { deadline: input.deadline ?? null } : {}),
        ...(input.exactTime !== undefined ? { exactTime: input.exactTime ?? null } : {}),
        ...(input.estimatedDuration !== undefined
          ? { estimatedDuration: input.estimatedDuration ?? null }
          : {}),
        ...(input.remindAt !== undefined ? { remindAt: input.remindAt ?? null } : {}),
        ...(input.comment !== undefined ? { comment: input.comment ?? null } : {}),
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.userId, userId), eq(tasks.id, id)))
      .returning();
    return toTask(row as Row);
  }

  private async assertExists(userId: string, id: string): Promise<Row> {
    const [row] = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.id, id)))
      .limit(1);
    if (!row) throw ApiException.notFound('Задача');
    return row;
  }

  /** Выполнение: задача уходит из активной и из закреплённых. */
  async complete(userId: string, id: string): Promise<Task> {
    await this.assertExists(userId, id);
    const [row] = await this.db
      .update(tasks)
      .set({ status: 'done', completedAt: new Date(), pinned: false, updatedAt: new Date() })
      .where(and(eq(tasks.userId, userId), eq(tasks.id, id)))
      .returning();
    await this.focus.clearIfActive(userId, id);
    return toTask(row as Row);
  }

  async reopen(userId: string, id: string): Promise<Task> {
    await this.assertExists(userId, id);
    const [row] = await this.db
      .update(tasks)
      .set({ status: 'open', completedAt: null, updatedAt: new Date() })
      .where(and(eq(tasks.userId, userId), eq(tasks.id, id)))
      .returning();
    return toTask(row as Row);
  }

  async setPinned(userId: string, id: string, pinned: boolean): Promise<Task> {
    await this.assertExists(userId, id);
    const [row] = await this.db
      .update(tasks)
      .set({ pinned, updatedAt: new Date() })
      .where(and(eq(tasks.userId, userId), eq(tasks.id, id)))
      .returning();
    return toTask(row as Row);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.assertExists(userId, id);
    await this.focus.clearIfActive(userId, id);
    await this.db.delete(tasks).where(and(eq(tasks.userId, userId), eq(tasks.id, id)));
    return { ok: true };
  }

  async reorder(userId: string, ids: string[]): Promise<{ ok: true }> {
    await Promise.all(
      ids.map((id, index) =>
        this.db
          .update(tasks)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(and(eq(tasks.userId, userId), eq(tasks.id, id))),
      ),
    );
    return { ok: true };
  }

  async addChecklistItem(userId: string, taskId: string, text: string) {
    await this.assertExists(userId, taskId);
    const [{ value } = { value: 0 }] = await this.db
      .select({ value: sql<number>`coalesce(max(${taskChecklistItems.sortOrder}), -1) + 1` })
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId));
    const [row] = await this.db
      .insert(taskChecklistItems)
      .values({ taskId, text, sortOrder: Number(value) })
      .returning();
    return row;
  }

  async updateChecklistItem(
    userId: string,
    taskId: string,
    itemId: string,
    patch: { text?: string; completed?: boolean },
  ) {
    await this.assertExists(userId, taskId);
    const [row] = await this.db
      .update(taskChecklistItems)
      .set({
        ...(patch.text !== undefined ? { text: patch.text } : {}),
        ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
      })
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)))
      .returning();
    if (!row) throw ApiException.notFound('Пункт чек-листа');
    return row;
  }

  async removeChecklistItem(userId: string, taskId: string, itemId: string) {
    await this.assertExists(userId, taskId);
    await this.db
      .delete(taskChecklistItems)
      .where(and(eq(taskChecklistItems.taskId, taskId), eq(taskChecklistItems.id, itemId)));
    return { ok: true as const };
  }

  /** Направление задачи всегда вычисляется через проект. */
  async directionOf(userId: string, taskId: string): Promise<string> {
    const [row] = await this.db
      .select({ directionId: projects.directionId })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(directions, eq(directions.id, projects.directionId))
      .where(and(eq(tasks.userId, userId), eq(tasks.id, taskId)));
    if (!row) throw ApiException.notFound('Задача');
    return row.directionId;
  }
}
