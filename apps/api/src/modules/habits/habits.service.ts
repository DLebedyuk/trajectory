import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { CreateHabitInput, HabitWithContext, UpdateHabitInput } from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import { directions, habits } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { isoRequired } from '../../common/mappers.js';

@Injectable()
export class HabitsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Привычки живых направлений: у архивного или удалённого направления они
   * пропадают из списков вместе с ним, а не висят сиротами на главной.
   */
  async list(userId: string, directionId?: string): Promise<HabitWithContext[]> {
    const conditions = [
      eq(habits.userId, userId),
      isNull(habits.deletedAt),
      isNull(directions.archivedAt),
      isNull(directions.deletedAt),
    ];
    if (directionId) conditions.push(eq(habits.directionId, directionId));
    const rows = await this.db
      .select({ habit: habits, directionName: directions.name, directionColor: directions.color })
      .from(habits)
      .innerJoin(directions, eq(directions.id, habits.directionId))
      .where(and(...conditions))
      .orderBy(asc(directions.sortOrder), asc(habits.sortOrder), asc(habits.createdAt));
    return rows.map((r) => ({
      id: r.habit.id,
      directionId: r.habit.directionId,
      title: r.habit.title,
      sortOrder: r.habit.sortOrder,
      createdAt: isoRequired(r.habit.createdAt),
      directionName: r.directionName,
      directionColor: r.directionColor,
    }));
  }

  private async one(userId: string, id: string): Promise<HabitWithContext> {
    const habit = (await this.list(userId)).find((h) => h.id === id);
    if (!habit) throw ApiException.notFound('Привычка');
    return habit;
  }

  async create(userId: string, input: CreateHabitInput): Promise<HabitWithContext> {
    const [dir] = await this.db
      .select({ id: directions.id })
      .from(directions)
      .where(
        and(
          eq(directions.userId, userId),
          eq(directions.id, input.directionId),
          isNull(directions.deletedAt),
        ),
      );
    if (!dir) throw ApiException.notFound('Направление');

    const [{ value } = { value: 0 }] = await this.db
      .select({ value: sql<number>`coalesce(max(${habits.sortOrder}), -1) + 1` })
      .from(habits)
      .where(and(eq(habits.userId, userId), eq(habits.directionId, input.directionId)));

    const [row] = await this.db
      .insert(habits)
      .values({
        userId,
        directionId: input.directionId,
        title: input.title,
        sortOrder: Number(value),
      })
      .returning({ id: habits.id });
    return this.one(userId, (row as { id: string }).id);
  }

  async update(userId: string, id: string, input: UpdateHabitInput): Promise<HabitWithContext> {
    await this.one(userId, id);
    await this.db
      .update(habits)
      .set({ title: input.title, updatedAt: new Date() })
      .where(and(eq(habits.userId, userId), eq(habits.id, id)));
    return this.one(userId, id);
  }

  async remove(userId: string, id: string): Promise<{ id: string }> {
    await this.one(userId, id);
    await this.db
      .update(habits)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(habits.userId, userId), eq(habits.id, id)));
    return { id };
  }
}
