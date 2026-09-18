import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { CreateTravelItemInput, TravelItem, UpdateTravelItemInput } from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import { travelCategories, travelItems } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { isoRequired } from '../../common/mappers.js';

type Row = typeof travelItems.$inferSelect;

const toItem = (r: Row, categoryName: string | null): TravelItem => ({
  id: r.id,
  userId: r.userId,
  name: r.name,
  categoryId: r.categoryId,
  categoryName,
  tags: (r.tags ?? []) as TravelItem['tags'],
  alwaysInclude: r.alwaysInclude,
  archived: r.archived,
  createdAt: isoRequired(r.createdAt),
  updatedAt: isoRequired(r.updatedAt),
});

/**
 * Стартовый набор категорий и вещей — чтобы личная база не была пустой при
 * первом заходе в раздел. Вставляется лениво, один раз на пользователя
 * (см. ensureDefaults), а не через dev-only db/seed.ts, который наполняет
 * только демо-аккаунт.
 */
const DEFAULT_CATEGORIES = [
  'Документы',
  'Деньги',
  'Одежда',
  'Обувь',
  'Техника',
  'Гигиена',
  'Здоровье',
  'В дорогу',
  'Другое',
] as const;

const DEFAULT_ITEMS: {
  category: (typeof DEFAULT_CATEGORIES)[number];
  name: string;
  tags?: string[];
  alwaysInclude?: boolean;
}[] = [
  { category: 'Документы', name: 'Паспорт', alwaysInclude: true },
  { category: 'Документы', name: 'Билеты', alwaysInclude: true },
  { category: 'Документы', name: 'Страховка', alwaysInclude: true },
  { category: 'Деньги', name: 'Наличные', alwaysInclude: true },
  { category: 'Деньги', name: 'Банковская карта', alwaysInclude: true },
  { category: 'Одежда', name: 'Нижнее бельё', alwaysInclude: true },
  { category: 'Одежда', name: 'Носки', alwaysInclude: true },
  { category: 'Одежда', name: 'Футболки', alwaysInclude: true },
  { category: 'Одежда', name: 'Пижама', alwaysInclude: true },
  { category: 'Одежда', name: 'Купальник', tags: ['sea'] },
  { category: 'Одежда', name: 'Свитер', tags: ['cold'] },
  { category: 'Одежда', name: 'Дождевик', tags: ['rain'] },
  { category: 'Одежда', name: 'Шорты', tags: ['heat'] },
  { category: 'Обувь', name: 'Повседневная обувь', alwaysInclude: true },
  { category: 'Обувь', name: 'Сандалии', tags: ['sea'] },
  { category: 'Обувь', name: 'Тёплая обувь', tags: ['cold'] },
  { category: 'Техника', name: 'Телефон', alwaysInclude: true },
  { category: 'Техника', name: 'Зарядка для телефона', alwaysInclude: true },
  { category: 'Техника', name: 'Powerbank', alwaysInclude: true },
  { category: 'Техника', name: 'Наушники', alwaysInclude: true },
  { category: 'Техника', name: 'Ноутбук', tags: ['work'] },
  { category: 'Техника', name: 'Зарядка для ноутбука', tags: ['work'] },
  { category: 'Гигиена', name: 'Зубная щётка', alwaysInclude: true },
  { category: 'Гигиена', name: 'Зубная паста', alwaysInclude: true },
  { category: 'Гигиена', name: 'Дезодорант', alwaysInclude: true },
  { category: 'Гигиена', name: 'Расчёска', alwaysInclude: true },
  { category: 'Здоровье', name: 'Аптечка', alwaysInclude: true },
  { category: 'Здоровье', name: 'Личные лекарства', alwaysInclude: true },
  { category: 'Здоровье', name: 'Солнцезащитный крем', tags: ['heat', 'sea'] },
  { category: 'В дорогу', name: 'Подушка для шеи', tags: ['plane'] },
  { category: 'В дорогу', name: 'Бутылка воды', tags: ['plane'] },
  { category: 'В дорогу', name: 'Плед', tags: ['car'] },
  { category: 'Другое', name: 'Зонт', tags: ['rain'] },
  { category: 'Другое', name: 'Книга или плеер в дорогу', tags: ['longTrip'] },
];

@Injectable()
export class TravelItemsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Заводит стартовый набор категорий и вещей при первом заходе пользователя в раздел. */
  async ensureDefaults(userId: string): Promise<void> {
    const [{ value } = { value: 0 }] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(travelCategories)
      .where(eq(travelCategories.userId, userId));
    if (Number(value) > 0) return;

    const catIds: Record<string, string> = {};
    for (const [i, name] of DEFAULT_CATEGORIES.entries()) {
      const [row] = await this.db
        .insert(travelCategories)
        .values({ userId, name, sortOrder: i })
        .onConflictDoNothing()
        .returning();
      if (row) catIds[name] = (row as { id: string }).id;
    }
    await this.db.insert(travelItems).values(
      DEFAULT_ITEMS.map((d) => ({
        userId,
        name: d.name,
        categoryId: catIds[d.category] ?? null,
        tags: d.tags ?? [],
        alwaysInclude: d.alwaysInclude ?? false,
      })),
    );
  }

  async categories(userId: string) {
    await this.ensureDefaults(userId);
    return this.db
      .select()
      .from(travelCategories)
      .where(eq(travelCategories.userId, userId))
      .orderBy(asc(travelCategories.sortOrder));
  }

  async createCategory(userId: string, name: string) {
    const [{ value } = { value: 0 }] = await this.db
      .select({ value: sql<number>`coalesce(max(${travelCategories.sortOrder}), -1) + 1` })
      .from(travelCategories)
      .where(eq(travelCategories.userId, userId));
    const [row] = await this.db
      .insert(travelCategories)
      .values({ userId, name, sortOrder: Number(value) })
      .onConflictDoNothing()
      .returning();
    return row ?? (await this.categories(userId)).find((c) => c.name === name);
  }

  async list(userId: string, includeArchived = false): Promise<TravelItem[]> {
    await this.ensureDefaults(userId);
    const conditions = [eq(travelItems.userId, userId)];
    if (!includeArchived) conditions.push(eq(travelItems.archived, false));
    const rows = await this.db
      .select({ item: travelItems, categoryName: travelCategories.name })
      .from(travelItems)
      .leftJoin(travelCategories, eq(travelCategories.id, travelItems.categoryId))
      .where(and(...conditions))
      .orderBy(asc(travelItems.name));
    return rows.map((r) => toItem(r.item, r.categoryName));
  }

  /** Все активные вещи пользователя — вход для генерации чек-листа. */
  async listActive(userId: string): Promise<TravelItem[]> {
    return this.list(userId, false);
  }

  async get(userId: string, id: string): Promise<TravelItem> {
    const [row] = await this.db
      .select({ item: travelItems, categoryName: travelCategories.name })
      .from(travelItems)
      .leftJoin(travelCategories, eq(travelCategories.id, travelItems.categoryId))
      .where(and(eq(travelItems.userId, userId), eq(travelItems.id, id)));
    if (!row) throw ApiException.notFound('Вещь');
    return toItem(row.item, row.categoryName);
  }

  async create(userId: string, input: CreateTravelItemInput): Promise<TravelItem> {
    const [row] = await this.db
      .insert(travelItems)
      .values({
        userId,
        name: input.name,
        categoryId: input.categoryId ?? null,
        tags: input.tags,
        alwaysInclude: input.alwaysInclude,
      })
      .returning();
    return this.get(userId, (row as Row).id);
  }

  async update(userId: string, id: string, input: UpdateTravelItemInput): Promise<TravelItem> {
    await this.get(userId, id);
    await this.db
      .update(travelItems)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId ?? null } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.alwaysInclude !== undefined ? { alwaysInclude: input.alwaysInclude } : {}),
        ...(input.archived !== undefined ? { archived: input.archived } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(travelItems.userId, userId), eq(travelItems.id, id)));
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.db
      .delete(travelItems)
      .where(and(eq(travelItems.userId, userId), eq(travelItems.id, id)));
    return { ok: true };
  }
}
