import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { CreateMediaItemInput, MediaItem, UpdateMediaItemInput } from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import { mediaCategories, mediaItems } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { dateOnly, isoRequired } from '../../common/mappers.js';

type Row = typeof mediaItems.$inferSelect;

const toItem = (r: Row, categoryName: string | null): MediaItem => ({
  id: r.id,
  userId: r.userId,
  kind: r.kind as MediaItem['kind'],
  title: r.title,
  authorOrDirector: r.authorOrDirector,
  categoryId: r.categoryId,
  categoryName,
  coverUrl: r.coverUrl,
  coverEmoji: r.coverEmoji,
  pinned: r.pinned,
  comment: r.comment,
  link: r.link,
  startedAt: dateOnly(r.startedAt),
  status: (r.status ?? 'want') as MediaItem['status'],
  rating: r.rating,
  createdAt: isoRequired(r.createdAt),
  updatedAt: isoRequired(r.updatedAt),
});

@Injectable()
export class MediaService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string, kind?: string, categoryId?: string): Promise<MediaItem[]> {
    const conditions = [eq(mediaItems.userId, userId), isNull(mediaItems.deletedAt)];
    if (kind) conditions.push(eq(mediaItems.kind, kind));
    if (categoryId) conditions.push(eq(mediaItems.categoryId, categoryId));
    const rows = await this.db
      .select({ item: mediaItems, categoryName: mediaCategories.name })
      .from(mediaItems)
      .leftJoin(mediaCategories, eq(mediaCategories.id, mediaItems.categoryId))
      .where(and(...conditions))
      .orderBy(desc(mediaItems.pinned), desc(mediaItems.createdAt));
    return rows.map((r) => toItem(r.item, r.categoryName));
  }

  async listPinned(userId: string): Promise<MediaItem[]> {
    const rows = await this.db
      .select({ item: mediaItems, categoryName: mediaCategories.name })
      .from(mediaItems)
      .leftJoin(mediaCategories, eq(mediaCategories.id, mediaItems.categoryId))
      .where(
        and(
          eq(mediaItems.userId, userId),
          eq(mediaItems.pinned, true),
          isNull(mediaItems.deletedAt),
        ),
      )
      .orderBy(asc(mediaItems.kind), desc(mediaItems.updatedAt));
    return rows.map((r) => toItem(r.item, r.categoryName));
  }

  async get(userId: string, id: string): Promise<MediaItem> {
    const [row] = await this.db
      .select({ item: mediaItems, categoryName: mediaCategories.name })
      .from(mediaItems)
      .leftJoin(mediaCategories, eq(mediaCategories.id, mediaItems.categoryId))
      .where(
        and(eq(mediaItems.userId, userId), eq(mediaItems.id, id), isNull(mediaItems.deletedAt)),
      );
    if (!row) throw ApiException.notFound('Книга или фильм');
    return toItem(row.item, row.categoryName);
  }

  async create(userId: string, input: CreateMediaItemInput): Promise<MediaItem> {
    const [row] = await this.db
      .insert(mediaItems)
      .values({
        userId,
        kind: input.kind,
        title: input.title,
        authorOrDirector: input.authorOrDirector ?? null,
        categoryId: input.categoryId ?? null,
        coverUrl: input.coverUrl ?? null,
        coverEmoji: input.coverEmoji ?? null,
        pinned: input.pinned,
        comment: input.comment ?? null,
        link: input.link ?? null,
        startedAt: input.startedAt ?? (input.pinned ? new Date().toISOString().slice(0, 10) : null),
        status: input.status,
        rating: input.rating,
      })
      .returning();
    return this.get(userId, (row as Row).id);
  }

  async update(userId: string, id: string, input: UpdateMediaItemInput): Promise<MediaItem> {
    await this.get(userId, id);
    await this.db
      .update(mediaItems)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.authorOrDirector !== undefined
          ? { authorOrDirector: input.authorOrDirector ?? null }
          : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId ?? null } : {}),
        ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl ?? null } : {}),
        ...(input.coverEmoji !== undefined ? { coverEmoji: input.coverEmoji ?? null } : {}),
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
        ...(input.comment !== undefined ? { comment: input.comment ?? null } : {}),
        ...(input.link !== undefined ? { link: input.link ?? null } : {}),
        ...(input.startedAt !== undefined ? { startedAt: input.startedAt ?? null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(mediaItems.userId, userId), eq(mediaItems.id, id)));
    return this.get(userId, id);
  }

  /** Закрепить можно сколько угодно книг и фильмов — это не статус. */
  async setPinned(userId: string, id: string, pinned: boolean): Promise<MediaItem> {
    const current = await this.get(userId, id);
    await this.db
      .update(mediaItems)
      .set({
        pinned,
        startedAt:
          pinned && !current.startedAt ? new Date().toISOString().slice(0, 10) : current.startedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(mediaItems.userId, userId), eq(mediaItems.id, id)));
    return this.get(userId, id);
  }

  /** Мягкое удаление: строка остаётся в базе, но нигде не показывается. */
  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.get(userId, id);
    await this.db
      .update(mediaItems)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(mediaItems.userId, userId), eq(mediaItems.id, id)));
    return { ok: true };
  }

  async categories(userId: string) {
    return this.db
      .select()
      .from(mediaCategories)
      .where(eq(mediaCategories.userId, userId))
      .orderBy(asc(mediaCategories.sortOrder));
  }

  async createCategory(userId: string, name: string) {
    const [{ value } = { value: 0 }] = await this.db
      .select({ value: sql<number>`coalesce(max(${mediaCategories.sortOrder}), -1) + 1` })
      .from(mediaCategories)
      .where(eq(mediaCategories.userId, userId));
    const [row] = await this.db
      .insert(mediaCategories)
      .values({ userId, name, sortOrder: Number(value) })
      .onConflictDoNothing()
      .returning();
    return row ?? (await this.categories(userId)).find((c) => c.name === name);
  }

  async removeCategory(userId: string, id: string) {
    await this.db
      .delete(mediaCategories)
      .where(and(eq(mediaCategories.userId, userId), eq(mediaCategories.id, id)));
    return { ok: true as const };
  }
}
