import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type {
  CreateProjectInput,
  Project,
  ProjectWithFlags,
  UpdateProjectInput,
} from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import { directions, projects, tasks, userFocus } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { dateOnly, iso, isoRequired } from '../../common/mappers.js';

type Row = typeof projects.$inferSelect;

const toProject = (r: Row): Project => ({
  id: r.id,
  userId: r.userId,
  directionId: r.directionId,
  title: r.title,
  desiredOutcome: r.desiredOutcome,
  status: r.status as Project['status'],
  deadline: dateOnly(r.deadline),
  sortOrder: r.sortOrder,
  notes: r.notes ?? [],
  createdAt: isoRequired(r.createdAt),
  completedAt: iso(r.completedAt),
  updatedAt: isoRequired(r.updatedAt),
});

@Injectable()
export class ProjectsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Проекты направления с признаками веса: сначала те, где есть активная или
   * закреплённая задача. Сами задачи страница направления не показывает.
   */
  async listByDirection(userId: string, directionId: string): Promise<ProjectWithFlags[]> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.directionId, directionId)))
      .orderBy(asc(projects.sortOrder), asc(projects.createdAt));

    const [focus] = await this.db.select().from(userFocus).where(eq(userFocus.userId, userId));
    const activeTaskId = focus?.activeTaskId ?? null;

    const agg = await this.db
      .select({
        projectId: tasks.projectId,
        pinned: sql<number>`count(*) filter (where ${tasks.pinned} and ${tasks.status} = 'open')`,
        open: sql<number>`count(*) filter (where ${tasks.status} = 'open')`,
      })
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .groupBy(tasks.projectId);
    const byProject = new Map(agg.map((a) => [a.projectId, a]));

    let activeTask: { projectId: string; title: string } | null = null;
    if (activeTaskId) {
      const [t] = await this.db
        .select({ projectId: tasks.projectId, title: tasks.title })
        .from(tasks)
        .where(eq(tasks.id, activeTaskId));
      activeTask = t ?? null;
    }

    return rows.map((r) => ({
      ...toProject(r),
      pinnedCount: Number(byProject.get(r.id)?.pinned ?? 0),
      openTaskCount: Number(byProject.get(r.id)?.open ?? 0),
      hasActiveTask: activeTask?.projectId === r.id,
      activeTaskTitle: activeTask?.projectId === r.id ? activeTask.title : null,
    }));
  }

  async get(userId: string, id: string): Promise<Project> {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, id)))
      .limit(1);
    if (!row) throw ApiException.notFound('Проект');
    return toProject(row);
  }

  /** Направление существует и принадлежит этому пользователю. */
  private async assertOwnDirection(userId: string, directionId: string): Promise<void> {
    const [dir] = await this.db
      .select({ id: directions.id })
      .from(directions)
      .where(and(eq(directions.userId, userId), eq(directions.id, directionId)));
    if (!dir) throw ApiException.notFound('Направление');
  }

  async create(userId: string, input: CreateProjectInput): Promise<Project> {
    await this.assertOwnDirection(userId, input.directionId);

    const [{ value } = { value: 0 }] = await this.db
      .select({ value: sql<number>`coalesce(max(${projects.sortOrder}), -1) + 1` })
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.directionId, input.directionId)));

    const [row] = await this.db
      .insert(projects)
      .values({
        userId,
        directionId: input.directionId,
        title: input.title,
        desiredOutcome: input.desiredOutcome ?? null,
        status: input.status,
        deadline: input.deadline ?? null,
        notes: input.notes,
        sortOrder: Number(value),
      })
      .returning();
    return toProject(row as Row);
  }

  async update(userId: string, id: string, input: UpdateProjectInput): Promise<Project> {
    await this.get(userId, id);
    // перенос в чужое направление недопустим: направление проверяем так же, как при создании
    if (input.directionId !== undefined) await this.assertOwnDirection(userId, input.directionId);
    const [row] = await this.db
      .update(projects)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.desiredOutcome !== undefined
          ? { desiredOutcome: input.desiredOutcome ?? null }
          : {}),
        ...(input.directionId !== undefined ? { directionId: input.directionId } : {}),
        // статуса здесь нет намеренно: завершение и возврат идут через
        // archive/restore, вместе с каскадом по задачам и снятием фокуса
        ...(input.deadline !== undefined ? { deadline: input.deadline ?? null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(projects.userId, userId), eq(projects.id, id)))
      .returning();
    return toProject(row as Row);
  }

  private async setStatus(userId: string, id: string, status: Project['status']): Promise<Project> {
    await this.get(userId, id);
    const [row] = await this.db
      .update(projects)
      .set({
        status,
        completedAt: status === 'archived' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.userId, userId), eq(projects.id, id)))
      .returning();
    return toProject(row as Row);
  }

  pause(userId: string, id: string): Promise<Project> {
    return this.setStatus(userId, id, 'paused');
  }

  resume(userId: string, id: string): Promise<Project> {
    return this.setStatus(userId, id, 'active');
  }

  /**
   * Завершение проекта: он уходит в архив, его открытые задачи закрываются
   * и снимаются с закрепления, активная задача этого проекта очищается.
   * Касания остаются в статистике направления — они принадлежат направлению.
   */
  async complete(userId: string, id: string): Promise<Project> {
    const project = await this.get(userId, id);
    await this.db
      .update(tasks)
      .set({ status: 'done', completedAt: new Date(), pinned: false, updatedAt: new Date() })
      .where(and(eq(tasks.userId, userId), eq(tasks.projectId, id), eq(tasks.status, 'open')));

    const [focus] = await this.db.select().from(userFocus).where(eq(userFocus.userId, userId));
    if (focus?.activeTaskId) {
      const [t] = await this.db
        .select({ projectId: tasks.projectId })
        .from(tasks)
        .where(eq(tasks.id, focus.activeTaskId));
      if (t?.projectId === id) {
        await this.db
          .update(userFocus)
          .set({ activeTaskId: null, updatedAt: new Date() })
          .where(eq(userFocus.userId, userId));
      }
    }
    void project;
    return this.setStatus(userId, id, 'archived');
  }
}
