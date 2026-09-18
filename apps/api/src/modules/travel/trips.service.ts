import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { diffDays, pickChecklistCandidates } from '@planner/shared';
import type {
  CreateTripChecklistItemInput,
  CreateTripInput,
  Trip,
  TripChecklistItem,
  TripWithStats,
  UpdateTripChecklistItemInput,
  UpdateTripInput,
} from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import { travelCategories, tripChecklistItems, trips } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { dateOnly, isoRequired } from '../../common/mappers.js';
import { TravelItemsService } from './travel-items.service.js';

type TripRow = typeof trips.$inferSelect;
type ChecklistRow = typeof tripChecklistItems.$inferSelect;

const toTrip = (r: TripRow): Trip => ({
  id: r.id,
  userId: r.userId,
  name: r.name,
  country: r.country,
  city: r.city,
  startDate: dateOnly(r.startDate) as string,
  endDate: dateOnly(r.endDate) as string,
  purposes: (r.purposes ?? []) as Trip['purposes'],
  transport: (r.transport ?? []) as Trip['transport'],
  conditions: r.conditions,
  status: r.status as Trip['status'],
  checklistGeneratedAt: r.checklistGeneratedAt ? isoRequired(r.checklistGeneratedAt) : null,
  createdAt: isoRequired(r.createdAt),
  updatedAt: isoRequired(r.updatedAt),
});

const toChecklistItem = (r: ChecklistRow, categoryName: string | null): TripChecklistItem => ({
  id: r.id,
  tripId: r.tripId,
  travelItemId: r.travelItemId,
  title: r.title,
  categoryId: r.categoryId,
  categoryName,
  packed: r.packed,
  needToBuy: r.needToBuy,
  quantity: r.quantity,
  note: r.note,
  sortOrder: r.sortOrder,
});

@Injectable()
export class TripsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(TravelItemsService) private readonly travelItems: TravelItemsService,
  ) {}

  async listWithStats(userId: string): Promise<TripWithStats[]> {
    const tripRows = await this.db
      .select()
      .from(trips)
      .where(eq(trips.userId, userId))
      .orderBy(asc(trips.startDate));
    const statsRows = await this.db
      .select({
        tripId: tripChecklistItems.tripId,
        total: sql<number>`count(*)`,
        packed: sql<number>`count(*) filter (where ${tripChecklistItems.packed})`,
        needToBuy: sql<number>`count(*) filter (where ${tripChecklistItems.needToBuy})`,
      })
      .from(tripChecklistItems)
      .innerJoin(trips, eq(trips.id, tripChecklistItems.tripId))
      .where(eq(trips.userId, userId))
      .groupBy(tripChecklistItems.tripId);
    const statsMap = new Map(statsRows.map((r) => [r.tripId, r]));

    return tripRows.map((r) => {
      const s = statsMap.get(r.id);
      return {
        ...toTrip(r),
        totalCount: Number(s?.total ?? 0),
        packedCount: Number(s?.packed ?? 0),
        needToBuyCount: Number(s?.needToBuy ?? 0),
      };
    });
  }

  private async getRow(userId: string, id: string): Promise<TripRow> {
    const [row] = await this.db
      .select()
      .from(trips)
      .where(and(eq(trips.userId, userId), eq(trips.id, id)));
    if (!row) throw ApiException.notFound('Поездка');
    return row;
  }

  async get(userId: string, id: string): Promise<Trip> {
    return toTrip(await this.getRow(userId, id));
  }

  async create(userId: string, input: CreateTripInput): Promise<Trip> {
    const [row] = await this.db
      .insert(trips)
      .values({
        userId,
        name: input.city ?? input.country,
        country: input.country,
        city: input.city ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        purposes: input.purposes,
        transport: input.transport,
        conditions: {
          canLaundry: input.conditions.canLaundry ?? false,
          needsLaptop: input.conditions.needsLaptop ?? false,
          seaOrPool: input.conditions.seaOrPool ?? false,
          activeOutdoor: input.conditions.activeOutdoor ?? false,
          specialEvent: input.conditions.specialEvent ?? false,
          comment: input.conditions.comment ?? null,
        },
      })
      .returning();
    return this.get(userId, (row as TripRow).id);
  }

  async update(userId: string, id: string, input: UpdateTripInput): Promise<Trip> {
    const current = await this.getRow(userId, id);
    await this.db
      .update(trips)
      .set({
        ...(input.name !== undefined ? { name: input.name ?? null } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.city !== undefined ? { city: input.city ?? null } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        ...(input.purposes !== undefined ? { purposes: input.purposes } : {}),
        ...(input.transport !== undefined ? { transport: input.transport } : {}),
        ...(input.conditions !== undefined
          ? { conditions: { ...current.conditions, ...input.conditions } }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(trips.userId, userId), eq(trips.id, id)));
    return this.get(userId, id);
  }

  async complete(userId: string, id: string): Promise<Trip> {
    return this.update(userId, id, { status: 'done' });
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.getRow(userId, id);
    await this.db.delete(trips).where(and(eq(trips.userId, userId), eq(trips.id, id)));
    return { ok: true };
  }

  async listChecklist(userId: string, tripId: string): Promise<TripChecklistItem[]> {
    await this.getRow(userId, tripId);
    const rows = await this.db
      .select({ item: tripChecklistItems, categoryName: travelCategories.name })
      .from(tripChecklistItems)
      .leftJoin(travelCategories, eq(travelCategories.id, tripChecklistItems.categoryId))
      .where(eq(tripChecklistItems.tripId, tripId))
      .orderBy(asc(tripChecklistItems.sortOrder));
    return rows.map((r) => toChecklistItem(r.item, r.categoryName));
  }

  private async nextSortOrder(tripId: string): Promise<number> {
    const [{ value } = { value: -1 }] = await this.db
      .select({ value: sql<number>`coalesce(max(${tripChecklistItems.sortOrder}), -1)` })
      .from(tripChecklistItems)
      .where(eq(tripChecklistItems.tripId, tripId));
    return Number(value) + 1;
  }

  async addChecklistItem(
    userId: string,
    tripId: string,
    input: CreateTripChecklistItemInput,
  ): Promise<TripChecklistItem> {
    await this.getRow(userId, tripId);
    const sortOrder = await this.nextSortOrder(tripId);
    const [row] = await this.db
      .insert(tripChecklistItems)
      .values({
        tripId,
        travelItemId: null,
        title: input.title,
        categoryId: input.categoryId ?? null,
        quantity: input.quantity,
        note: input.note ?? null,
        sortOrder,
      })
      .returning();
    return this.getFullChecklistItem((row as ChecklistRow).id);
  }

  private async getFullChecklistItem(itemId: string): Promise<TripChecklistItem> {
    const [full] = await this.db
      .select({ item: tripChecklistItems, categoryName: travelCategories.name })
      .from(tripChecklistItems)
      .leftJoin(travelCategories, eq(travelCategories.id, tripChecklistItems.categoryId))
      .where(eq(tripChecklistItems.id, itemId));
    return toChecklistItem((full as { item: ChecklistRow }).item, full?.categoryName ?? null);
  }

  private async getChecklistRow(
    userId: string,
    tripId: string,
    itemId: string,
  ): Promise<ChecklistRow> {
    await this.getRow(userId, tripId);
    const [row] = await this.db
      .select()
      .from(tripChecklistItems)
      .where(and(eq(tripChecklistItems.tripId, tripId), eq(tripChecklistItems.id, itemId)));
    if (!row) throw ApiException.notFound('Пункт чек-листа');
    return row;
  }

  async updateChecklistItem(
    userId: string,
    tripId: string,
    itemId: string,
    input: UpdateTripChecklistItemInput,
  ): Promise<TripChecklistItem> {
    await this.getChecklistRow(userId, tripId, itemId);
    await this.db
      .update(tripChecklistItems)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId ?? null } : {}),
        ...(input.packed !== undefined ? { packed: input.packed } : {}),
        ...(input.needToBuy !== undefined ? { needToBuy: input.needToBuy } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.note !== undefined ? { note: input.note ?? null } : {}),
      })
      .where(eq(tripChecklistItems.id, itemId));
    return this.getFullChecklistItem(itemId);
  }

  async removeChecklistItem(userId: string, tripId: string, itemId: string): Promise<{ ok: true }> {
    await this.getChecklistRow(userId, tripId, itemId);
    await this.db.delete(tripChecklistItems).where(eq(tripChecklistItems.id, itemId));
    return { ok: true };
  }

  /**
   * Первая генерация и последующее «Обновить рекомендации» — одна и та же
   * операция: посчитать кандидатов заново и добавить только те, которых ещё
   * нет в чек-листе. Уже добавленные пункты (в т.ч. отмеченные/изменённые
   * вручную) не трогаем — задача явно требует не уничтожать ручные правки.
   */
  async refreshChecklist(userId: string, tripId: string): Promise<TripChecklistItem[]> {
    const trip = await this.getRow(userId, tripId);
    const items = await this.travelItems.listActive(userId);
    const durationDays = diffDays(dateOnly(trip.endDate) as string, dateOnly(trip.startDate) as string) + 1;
    const tags = new Set<string>(['always']);
    for (const t of (trip.transport ?? []) as string[]) tags.add(t);
    for (const p of (trip.purposes ?? []) as string[]) tags.add(p);
    if (trip.conditions.seaOrPool) tags.add('sea');
    if (durationDays <= 4) tags.add('shortTrip');
    else if (durationDays >= 8) tags.add('longTrip');

    const candidates = pickChecklistCandidates(items, tags);
    const existing = await this.db
      .select({ travelItemId: tripChecklistItems.travelItemId })
      .from(tripChecklistItems)
      .where(eq(tripChecklistItems.tripId, tripId));
    const existingIds = new Set(existing.map((e) => e.travelItemId).filter(Boolean));
    const toAdd = candidates.filter((c) => !existingIds.has(c.id));

    if (toAdd.length > 0) {
      let sortOrder = await this.nextSortOrder(tripId);
      await this.db.insert(tripChecklistItems).values(
        toAdd.map((c) => ({
          tripId,
          travelItemId: c.id,
          title: c.name,
          categoryId: c.categoryId,
          quantity: 1,
          sortOrder: sortOrder++,
        })),
      );
    }
    if (!trip.checklistGeneratedAt) {
      await this.db.update(trips).set({ checklistGeneratedAt: new Date() }).where(eq(trips.id, tripId));
    }
    return this.listChecklist(userId, tripId);
  }
}
