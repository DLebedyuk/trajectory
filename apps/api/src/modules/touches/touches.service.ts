import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { CreateTouchInput, Heatmap, TouchQuery, TouchWithContext } from '@planner/contracts';
import { addDaysToDateOnly, startOfWeek, todayInTimezone } from '@planner/shared';
import { DB, type Database } from '../../db/db.module.js';
import { directions, projects, touches, users } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { dateOnly, isoRequired } from '../../common/mappers.js';

@Injectable()
export class TouchesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async query(userId: string, q: TouchQuery, limit?: number) {
    const conditions = [eq(touches.userId, userId)];
    if (q.directionId) conditions.push(eq(touches.directionId, q.directionId));
    if (q.from) conditions.push(gte(touches.date, q.from));
    if (q.to) conditions.push(lte(touches.date, q.to));
    const rows = await this.db
      .select({
        touch: touches,
        directionName: directions.name,
        directionColor: directions.color,
        projectTitle: projects.title,
      })
      .from(touches)
      .innerJoin(directions, eq(directions.id, touches.directionId))
      .leftJoin(projects, eq(projects.id, touches.projectId))
      .where(and(...conditions))
      .orderBy(desc(touches.date), desc(touches.createdAt))
      .limit(limit ?? q.limit ?? 200);
    return rows;
  }

  async list(userId: string, q: TouchQuery): Promise<TouchWithContext[]> {
    const rows = await this.query(userId, q);
    return rows.map((r) => ({
      id: r.touch.id,
      userId: r.touch.userId,
      directionId: r.touch.directionId,
      projectId: r.touch.projectId,
      date: dateOnly(r.touch.date) as string,
      title: r.touch.title,
      comment: r.touch.comment,
      createdAt: isoRequired(r.touch.createdAt),
      directionName: r.directionName,
      directionColor: r.directionColor,
      projectTitle: r.projectTitle,
    }));
  }

  async byDate(userId: string, date: string, directionId?: string): Promise<TouchWithContext[]> {
    return this.list(userId, { from: date, to: date, directionId, limit: 100 });
  }

  async create(userId: string, input: CreateTouchInput): Promise<TouchWithContext> {
    const [dir] = await this.db
      .select({ id: directions.id })
      .from(directions)
      .where(and(eq(directions.userId, userId), eq(directions.id, input.directionId)));
    if (!dir) throw ApiException.notFound('Направление');

    if (input.projectId) {
      const [project] = await this.db
        .select({ directionId: projects.directionId })
        .from(projects)
        .where(and(eq(projects.userId, userId), eq(projects.id, input.projectId)));
      if (!project) throw ApiException.notFound('Проект');
      // касание принадлежит направлению, поэтому проект обязан быть из него же
      if (project.directionId !== input.directionId) {
        throw ApiException.validation('Проект относится к другому направлению');
      }
    }

    const [row] = await this.db
      .insert(touches)
      .values({
        userId,
        directionId: input.directionId,
        projectId: input.projectId ?? null,
        date: input.date,
        title: input.title,
        comment: input.comment ?? null,
      })
      .returning();
    const list = await this.list(userId, { from: input.date, to: input.date, limit: 100 });
    return list.find((t) => t.id === (row as { id: string }).id) as TouchWithContext;
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.db.delete(touches).where(and(eq(touches.userId, userId), eq(touches.id, id)));
    return { ok: true };
  }

  /** Карта касаний: агрегат по дням с разбивкой по направлениям. */
  async heatmap(userId: string, weeks: number, directionId?: string): Promise<Heatmap> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    const timezone = user?.timezone ?? 'UTC';
    const today = todayInTimezone(timezone);
    const to = today;
    const from = addDaysToDateOnly(startOfWeek(today), -(weeks - 1) * 7);

    const conditions = [eq(touches.userId, userId), gte(touches.date, from), lte(touches.date, to)];
    if (directionId) conditions.push(eq(touches.directionId, directionId));

    const rows = await this.db
      .select({
        date: touches.date,
        directionId: touches.directionId,
        color: directions.color,
        count: sql<number>`count(*)`,
      })
      .from(touches)
      .innerJoin(directions, eq(directions.id, touches.directionId))
      .where(and(...conditions))
      .groupBy(touches.date, touches.directionId, directions.color)
      .orderBy(asc(touches.date));

    const byDate = new Map<string, Heatmap['days'][number]>();
    let total = 0;
    for (const r of rows) {
      const key = dateOnly(r.date) as string;
      const cnt = Number(r.count);
      total += cnt;
      const day = byDate.get(key) ?? { date: key, total: 0, directions: [] };
      day.total += cnt;
      day.directions.push({ directionId: r.directionId, color: r.color, count: cnt });
      byDate.set(key, day);
    }

    const weekStart = startOfWeek(today);
    const weekTotal = [...byDate.values()]
      .filter((d) => d.date >= weekStart)
      .reduce((acc, d) => acc + d.total, 0);

    return { from, to, days: [...byDate.values()], weekTotal, total };
  }
}
