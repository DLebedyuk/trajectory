import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, isNull, max, sql } from 'drizzle-orm';
import type {
  CreateDirectionInput,
  Direction,
  DirectionWithStats,
  UpdateDirectionInput,
} from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import { directions, touches } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { dateOnly, isoRequired, iso } from '../../common/mappers.js';

type Row = typeof directions.$inferSelect;

const toDirection = (r: Row): Direction => ({
  id: r.id,
  userId: r.userId,
  name: r.name,
  description: r.description,
  color: r.color,
  icon: r.icon,
  motto: r.motto,
  showMotto: r.showMotto,
  sortOrder: r.sortOrder,
  archivedAt: iso(r.archivedAt),
  createdAt: isoRequired(r.createdAt),
  updatedAt: isoRequired(r.updatedAt),
});

@Injectable()
export class DirectionsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string, includeArchived = false): Promise<DirectionWithStats[]> {
    const rows = await this.db
      .select()
      .from(directions)
      .where(
        includeArchived
          ? eq(directions.userId, userId)
          : and(eq(directions.userId, userId), isNull(directions.archivedAt)),
      )
      .orderBy(asc(directions.sortOrder), asc(directions.createdAt));

    const stats = await this.db
      .select({
        directionId: touches.directionId,
        total: count(touches.id),
        last: max(touches.date),
      })
      .from(touches)
      .where(eq(touches.userId, userId))
      .groupBy(touches.directionId);

    const byId = new Map(stats.map((s) => [s.directionId, s]));
    return rows.map((r) => ({
      ...toDirection(r),
      touchCount: Number(byId.get(r.id)?.total ?? 0),
      lastTouchDate: dateOnly(byId.get(r.id)?.last ?? null),
    }));
  }

  async get(userId: string, id: string): Promise<Direction> {
    const [row] = await this.db
      .select()
      .from(directions)
      .where(and(eq(directions.userId, userId), eq(directions.id, id)))
      .limit(1);
    if (!row) throw ApiException.notFound('Направление');
    return toDirection(row);
  }

  async create(userId: string, input: CreateDirectionInput): Promise<Direction> {
    const [{ value } = { value: 0 }] = await this.db
      .select({ value: sql<number>`coalesce(max(${directions.sortOrder}), -1) + 1` })
      .from(directions)
      .where(eq(directions.userId, userId));
    const [row] = await this.db
      .insert(directions)
      .values({
        userId,
        name: input.name,
        description: input.description ?? null,
        color: input.color,
        icon: input.icon,
        motto: input.motto ?? null,
        showMotto: input.showMotto,
        sortOrder: Number(value),
      })
      .returning();
    return toDirection(row as Row);
  }

  async update(userId: string, id: string, input: UpdateDirectionInput): Promise<Direction> {
    await this.get(userId, id);
    const [row] = await this.db
      .update(directions)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.motto !== undefined ? { motto: input.motto ?? null } : {}),
        ...(input.showMotto !== undefined ? { showMotto: input.showMotto } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(directions.userId, userId), eq(directions.id, id)))
      .returning();
    return toDirection(row as Row);
  }

  async reorder(userId: string, ids: string[]): Promise<DirectionWithStats[]> {
    await Promise.all(
      ids.map((id, index) =>
        this.db
          .update(directions)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(and(eq(directions.userId, userId), eq(directions.id, id))),
      ),
    );
    return this.list(userId);
  }

  async archive(userId: string, id: string): Promise<Direction> {
    await this.get(userId, id);
    const [row] = await this.db
      .update(directions)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(directions.userId, userId), eq(directions.id, id)))
      .returning();
    return toDirection(row as Row);
  }

  async restore(userId: string, id: string): Promise<Direction> {
    const [row] = await this.db
      .update(directions)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(and(eq(directions.userId, userId), eq(directions.id, id)))
      .returning();
    if (!row) throw ApiException.notFound('Направление');
    return toDirection(row);
  }

  /** Последние касания направления — нужны его странице. */
  async recentTouches(userId: string, id: string, limit = 5) {
    return this.db
      .select()
      .from(touches)
      .where(and(eq(touches.userId, userId), eq(touches.directionId, id)))
      .orderBy(desc(touches.date), desc(touches.createdAt))
      .limit(limit);
  }
}
