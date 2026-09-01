import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import type {
  CreateMenuItemInput,
  MenuFilter,
  MenuItem,
  UpdateMenuItemInput,
} from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import { menuItems } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { isoRequired } from '../../common/mappers.js';

type Row = typeof menuItems.$inferSelect;
const toItem = (r: Row): MenuItem => ({
  id: r.id,
  userId: r.userId,
  title: r.title,
  category: r.category,
  energy: r.energy as MenuItem['energy'],
  estimatedTime: r.estimatedTime as MenuItem['estimatedTime'],
  cost: r.cost as MenuItem['cost'],
  place: r.place as MenuItem['place'],
  company: r.company as MenuItem['company'],
  comment: r.comment,
  link: r.link,
  tried: r.tried,
  createdAt: isoRequired(r.createdAt),
  updatedAt: isoRequired(r.updatedAt),
});

@Injectable()
export class MenuService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string, filter: MenuFilter = {}): Promise<MenuItem[]> {
    const conditions: SQL[] = [eq(menuItems.userId, userId)];
    if (filter.category) conditions.push(eq(menuItems.category, filter.category));
    if (filter.energy) conditions.push(eq(menuItems.energy, filter.energy));
    if (filter.estimatedTime) conditions.push(eq(menuItems.estimatedTime, filter.estimatedTime));
    if (filter.cost) conditions.push(eq(menuItems.cost, filter.cost));
    if (filter.place) conditions.push(eq(menuItems.place, filter.place));
    if (filter.company) conditions.push(eq(menuItems.company, filter.company));
    if (filter.tried !== undefined) conditions.push(eq(menuItems.tried, filter.tried));
    const rows = await this.db
      .select()
      .from(menuItems)
      .where(and(...conditions))
      .orderBy(desc(menuItems.createdAt));
    return rows.map(toItem);
  }

  async create(userId: string, input: CreateMenuItemInput): Promise<MenuItem> {
    const [row] = await this.db
      .insert(menuItems)
      .values({ userId, ...input, comment: input.comment ?? null, link: input.link ?? null })
      .returning();
    return toItem(row as Row);
  }

  async update(userId: string, id: string, input: UpdateMenuItemInput): Promise<MenuItem> {
    const [row] = await this.db
      .update(menuItems)
      .set({
        ...input,
        ...(input.comment !== undefined ? { comment: input.comment ?? null } : {}),
        ...(input.link !== undefined ? { link: input.link ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(menuItems.userId, userId), eq(menuItems.id, id)))
      .returning();
    if (!row) throw ApiException.notFound('Возможность');
    return toItem(row);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.db.delete(menuItems).where(and(eq(menuItems.userId, userId), eq(menuItems.id, id)));
    return { ok: true };
  }

  async categories(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ category: menuItems.category })
      .from(menuItems)
      .where(eq(menuItems.userId, userId));
    return rows.map((r) => r.category).sort();
  }
}
