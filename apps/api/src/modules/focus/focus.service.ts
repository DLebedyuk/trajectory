import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Focus, TaskWithContext } from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import { directions, projects, taskChecklistItems, tasks, userFocus } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { dateOnly, iso, isoRequired } from '../../common/mappers.js';

@Injectable()
export class FocusService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async ensureRow(userId: string) {
    const [row] = await this.db.select().from(userFocus).where(eq(userFocus.userId, userId));
    if (row) return row;
    const [created] = await this.db.insert(userFocus).values({ userId }).returning();
    return created as typeof userFocus.$inferSelect;
  }

  async loadTaskWithContext(userId: string, taskId: string): Promise<TaskWithContext | null> {
    const [row] = await this.db
      .select({
        task: tasks,
        projectTitle: projects.title,
        directionId: directions.id,
        directionName: directions.name,
        directionColor: directions.color,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(directions, eq(directions.id, projects.directionId))
      .where(and(eq(tasks.userId, userId), eq(tasks.id, taskId)))
      .limit(1);
    if (!row) return null;
    const checklist = await this.db
      .select()
      .from(taskChecklistItems)
      .where(eq(taskChecklistItems.taskId, taskId))
      .orderBy(taskChecklistItems.sortOrder);
    const t = row.task;
    return {
      id: t.id,
      userId: t.userId,
      projectId: t.projectId,
      title: t.title,
      status: t.status as TaskWithContext['status'],
      pinned: t.pinned,
      deadline: dateOnly(t.deadline),
      exactTime: t.exactTime,
      estimatedDuration: t.estimatedDuration as TaskWithContext['estimatedDuration'],
      remindAt: dateOnly(t.remindAt),
      comment: t.comment,
      sortOrder: t.sortOrder,
      createdAt: isoRequired(t.createdAt),
      completedAt: iso(t.completedAt),
      updatedAt: isoRequired(t.updatedAt),
      checklist: checklist.map((c) => ({
        id: c.id,
        taskId: c.taskId,
        text: c.text,
        completed: c.completed,
        sortOrder: c.sortOrder,
      })),
      projectTitle: row.projectTitle,
      directionId: row.directionId,
      directionName: row.directionName,
      directionColor: row.directionColor,
    };
  }

  async get(userId: string): Promise<Focus> {
    const row = await this.ensureRow(userId);
    const activeTask = row.activeTaskId
      ? await this.loadTaskWithContext(userId, row.activeTaskId)
      : null;
    let direction = null as Focus['direction'];
    if (row.focusDirectionId) {
      const [d] = await this.db
        .select()
        .from(directions)
        .where(and(eq(directions.userId, userId), eq(directions.id, row.focusDirectionId)));
      direction = d
        ? {
            id: d.id,
            userId: d.userId,
            name: d.name,
            description: d.description,
            color: d.color,
            icon: d.icon,
            motto: d.motto,
            showMotto: d.showMotto,
            sortOrder: d.sortOrder,
            notes: d.notes,
            archivedAt: iso(d.archivedAt),
            createdAt: isoRequired(d.createdAt),
            updatedAt: isoRequired(d.updatedAt),
          }
        : null;
    }
    return {
      focusDirectionId: row.focusDirectionId,
      activeTaskId: row.activeTaskId,
      direction,
      activeTask,
    };
  }

  /**
   * Смена направления в фокусе. Противоречивое состояние
   * («в фокусе Физика, а активная задача из Озвучки») не допускается:
   * при конфликте сервер отвечает 409 и клиент показывает выбор.
   */
  async setDirection(
    userId: string,
    directionId: string | null,
    onConflict: 'ask' | 'keepTask' | 'clearTask',
  ): Promise<Focus> {
    await this.ensureRow(userId);

    if (directionId) {
      const [d] = await this.db
        .select({ id: directions.id, name: directions.name })
        .from(directions)
        .where(and(eq(directions.userId, userId), eq(directions.id, directionId)));
      if (!d) throw ApiException.notFound('Направление');

      const current = await this.get(userId);
      const active = current.activeTask;
      if (active && active.directionId !== directionId) {
        if (onConflict === 'ask') {
          throw ApiException.conflict(
            'focus_direction_conflict',
            'Активная задача принадлежит другому направлению',
            {
              code: 'focus_direction_conflict',
              message: 'Активная задача принадлежит другому направлению',
              activeTaskId: active.id,
              activeTaskTitle: active.title,
              activeTaskDirectionId: active.directionId,
              activeTaskDirectionName: active.directionName,
              requestedDirectionId: d.id,
              requestedDirectionName: d.name,
            },
          );
        }
        if (onConflict === 'keepTask') {
          // оставляем всё как есть: направление в фокусе не меняется
          return current;
        }
        await this.db
          .update(userFocus)
          .set({ activeTaskId: null, focusDirectionId: directionId, updatedAt: new Date() })
          .where(eq(userFocus.userId, userId));
        return this.get(userId);
      }
    }

    await this.db
      .update(userFocus)
      .set({ focusDirectionId: directionId, updatedAt: new Date() })
      .where(eq(userFocus.userId, userId));
    return this.get(userId);
  }

  /**
   * Активной может быть ровно одна задача. Её направление автоматически
   * становится направлением в фокусе; предыдущая активная задача просто
   * остаётся обычной открытой задачей своего проекта.
   */
  async setActiveTask(userId: string, taskId: string | null): Promise<Focus> {
    await this.ensureRow(userId);
    if (!taskId) {
      await this.db
        .update(userFocus)
        .set({ activeTaskId: null, updatedAt: new Date() })
        .where(eq(userFocus.userId, userId));
      return this.get(userId);
    }
    const task = await this.loadTaskWithContext(userId, taskId);
    if (!task) throw ApiException.notFound('Задача');
    if (task.status === 'done') {
      throw ApiException.validation('Нельзя сделать активной уже выполненную задачу');
    }
    await this.db
      .update(userFocus)
      .set({
        activeTaskId: taskId,
        focusDirectionId: task.directionId,
        updatedAt: new Date(),
      })
      .where(eq(userFocus.userId, userId));
    return this.get(userId);
  }

  /** Снимает задачу с активной, если она ею была (используется при завершении и удалении). */
  async clearIfActive(userId: string, taskId: string): Promise<void> {
    await this.db
      .update(userFocus)
      .set({ activeTaskId: null, updatedAt: new Date() })
      .where(and(eq(userFocus.userId, userId), eq(userFocus.activeTaskId, taskId)));
  }

  async getActiveTaskId(userId: string): Promise<string | null> {
    const row = await this.ensureRow(userId);
    return row.activeTaskId;
  }
}
