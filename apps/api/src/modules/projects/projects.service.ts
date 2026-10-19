import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type {
  CreateProjectInput,
  Overview,
  OverviewScope,
  Project,
  ProjectWithFlags,
  UpdateProjectInput,
} from '@planner/contracts';
import { todayInTimezone } from '@planner/shared';
import { DB, type Database } from '../../db/db.module.js';
import { directions, projects, tasks, userFocus, users } from '../../db/schema.js';
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
  pinned: r.pinned,
  priority: (r.priority ?? null) as Project['priority'],
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
      .where(
        and(
          eq(projects.userId, userId),
          eq(projects.directionId, directionId),
          isNull(projects.deletedAt),
        ),
      )
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
      .where(and(eq(projects.userId, userId), eq(projects.id, id), isNull(projects.deletedAt)))
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
        pinned: input.pinned ?? false,
        priority: input.priority ?? null,
        sortOrder: Number(value),
      })
      .returning();
    return toProject(row as Row);
  }

  async update(userId: string, id: string, input: UpdateProjectInput): Promise<Project> {
    const current = await this.get(userId, id);
    // завершённый проект в обзоре не показывается — закрепить его значило бы
    // получить закрепление, которое нигде не видно
    if (input.pinned && current.status === 'archived') {
      throw ApiException.validation(
        'Завершённый проект нельзя закрепить. Сначала верните его из архива.',
      );
    }
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
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
        ...(input.priority !== undefined ? { priority: input.priority ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(projects.userId, userId), eq(projects.id, id)))
      .returning();
    return toProject(row as Row);
  }

  /**
   * Ручной порядок проектов одного направления. Можно передать только часть
   * проектов — например, закреплённые: они меняются местами между собой, а
   * остальные остаются на своих позициях. Затем весь список направления
   * получает sortOrder подряд, чтобы старые одинаковые значения не делали
   * порядок случайным.
   */
  async reorder(userId: string, ids: string[]): Promise<{ ok: true }> {
    if (new Set(ids).size !== ids.length) throw ApiException.validation('Проекты повторяются');

    await this.db.transaction(async (tx) => {
      const picked = await tx
        .select({ id: projects.id, directionId: projects.directionId })
        .from(projects)
        .where(
          and(eq(projects.userId, userId), inArray(projects.id, ids), isNull(projects.deletedAt)),
        );
      if (picked.length !== ids.length) throw ApiException.notFound('Проект');
      const directionId = picked[0]!.directionId;
      if (picked.some((p) => p.directionId !== directionId)) {
        throw ApiException.validation('Порядок меняется внутри одного направления');
      }

      const all = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.userId, userId), eq(projects.directionId, directionId)))
        .orderBy(asc(projects.sortOrder), asc(projects.createdAt));

      const chosen = new Set(ids);
      let next = 0;
      const order = all.map((p) => (chosen.has(p.id) ? ids[next++]! : p.id));

      for (const [index, id] of order.entries()) {
        await tx
          .update(projects)
          .set({ sortOrder: index })
          .where(and(eq(projects.userId, userId), eq(projects.id, id)));
      }
    });
    return { ok: true };
  }

  /**
   * Общая картина для вкладки «Обзор». Проекты — те же строки, что и в
   * направлениях, только с направлением и счётчиками задач. Завершённые
   * проекты и архивные направления сюда не попадают: это картина того,
   * что сейчас живо. Счётчики наверху не зависят от scope.
   */
  async overview(userId: string, scope: OverviewScope): Promise<Overview> {
    const [user] = await this.db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId));
    const today = todayInTimezone(user?.timezone ?? 'UTC');

    const rows = await this.db
      .select({ project: projects, direction: directions })
      .from(projects)
      .innerJoin(directions, eq(directions.id, projects.directionId))
      .where(
        and(
          eq(projects.userId, userId),
          isNull(projects.deletedAt),
          ne(projects.status, 'archived'),
          isNull(directions.deletedAt),
          isNull(directions.archivedAt),
        ),
      )
      .orderBy(
        asc(directions.sortOrder),
        asc(directions.createdAt),
        asc(projects.sortOrder),
        asc(projects.createdAt),
      );

    const projectIds = rows.map((r) => r.project.id);
    const agg = projectIds.length
      ? await this.db
          .select({
            projectId: tasks.projectId,
            open: sql<number>`count(*) filter (where ${tasks.status} = 'open')`,
            done: sql<number>`count(*) filter (where ${tasks.status} = 'done')`,
            overdue: sql<number>`count(*) filter (where ${tasks.status} = 'open' and ${tasks.deadline} < ${today})`,
            nextDeadline: sql<
              string | null
            >`(min(${tasks.deadline}) filter (where ${tasks.status} = 'open'))::text`,
          })
          .from(tasks)
          .where(
            and(
              eq(tasks.userId, userId),
              inArray(tasks.projectId, projectIds),
              isNull(tasks.deletedAt),
            ),
          )
          .groupBy(tasks.projectId)
      : [];
    const byProject = new Map(agg.map((a) => [a.projectId, a]));

    const [focus] = await this.db.select().from(userFocus).where(eq(userFocus.userId, userId));
    let activeProjectId: string | null = null;
    if (focus?.activeTaskId) {
      const [t] = await this.db
        .select({ projectId: tasks.projectId })
        .from(tasks)
        .where(eq(tasks.id, focus.activeTaskId));
      activeProjectId = t?.projectId ?? null;
    }

    const [{ value: directionCount } = { value: 0 }] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(directions)
      .where(
        and(
          eq(directions.userId, userId),
          isNull(directions.deletedAt),
          isNull(directions.archivedAt),
        ),
      );

    const all = rows.map(({ project, direction }) => {
      const a = byProject.get(project.id);
      const own = dateOnly(project.deadline);
      const fromTasks = a?.nextDeadline ?? null;
      // даты YYYY-MM-DD сравниваются как строки
      const nextDeadline =
        own && fromTasks ? (own < fromTasks ? own : fromTasks) : (own ?? fromTasks);
      return {
        ...toProject(project),
        directionName: direction.name,
        directionColor: direction.color,
        openTaskCount: Number(a?.open ?? 0),
        doneTaskCount: Number(a?.done ?? 0),
        overdueTaskCount: Number(a?.overdue ?? 0),
        nextDeadline,
        hasActiveTask: activeProjectId === project.id,
      };
    });

    return {
      stats: {
        directions: Number(directionCount),
        projects: all.length,
        pinned: all.filter((p) => p.pinned).length,
        openTasks: all.reduce((n, p) => n + p.openTaskCount, 0),
        overdueTasks: all.reduce((n, p) => n + p.overdueTaskCount, 0),
      },
      projects: scope === 'pinned' ? all.filter((p) => p.pinned) : all,
    };
  }

  private async setStatus(userId: string, id: string, status: Project['status']): Promise<Project> {
    await this.get(userId, id);
    const [row] = await this.db
      .update(projects)
      .set({
        status,
        completedAt: status === 'archived' ? new Date() : null,
        ...(status === 'archived' ? { pinned: false } : {}),
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
    await this.get(userId, id);
    // одна транзакция на все три таблицы — иначе падение процесса между
    // шагами могло оставить проект «живым» с уже закрытыми задачами
    await this.db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ status: 'done', completedAt: new Date(), pinned: false, updatedAt: new Date() })
        .where(and(eq(tasks.userId, userId), eq(tasks.projectId, id), eq(tasks.status, 'open')));

      const [focus] = await tx.select().from(userFocus).where(eq(userFocus.userId, userId));
      if (focus?.activeTaskId) {
        const [t] = await tx
          .select({ projectId: tasks.projectId })
          .from(tasks)
          .where(eq(tasks.id, focus.activeTaskId));
        if (t?.projectId === id) {
          await tx
            .update(userFocus)
            .set({ activeTaskId: null, updatedAt: new Date() })
            .where(eq(userFocus.userId, userId));
        }
      }

      await tx
        .update(projects)
        // завершённый проект уходит из обзора: закрепление снимается,
        // приоритет остаётся — вернётся проект из архива с ним же
        .set({ status: 'archived', completedAt: new Date(), pinned: false, updatedAt: new Date() })
        .where(and(eq(projects.userId, userId), eq(projects.id, id)));
    });
    return this.get(userId, id);
  }

  /**
   * Удаление: проект и все его задачи помечаются deletedAt — остаются в
   * базе, но нигде не показываются. Касания не трогаем: они принадлежат
   * направлению независимо от судьбы проекта.
   */
  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.get(userId, id);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(tasks.userId, userId), eq(tasks.projectId, id)));

      await tx
        .update(projects)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(projects.userId, userId), eq(projects.id, id)));

      const [focus] = await tx.select().from(userFocus).where(eq(userFocus.userId, userId));
      if (focus?.activeTaskId) {
        const [t] = await tx
          .select({ projectId: tasks.projectId })
          .from(tasks)
          .where(eq(tasks.id, focus.activeTaskId));
        if (t?.projectId === id) {
          await tx
            .update(userFocus)
            .set({ activeTaskId: null, updatedAt: now })
            .where(eq(userFocus.userId, userId));
        }
      }
    });
    return { ok: true };
  }
}
