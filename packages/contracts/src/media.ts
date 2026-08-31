import { z } from 'zod';
import { dateOnly, mediaKind, uuid } from './common.js';

export const mediaCategorySchema = z.object({
  id: uuid,
  userId: uuid,
  name: z.string().min(1).max(60),
  sortOrder: z.number().int(),
});
export type MediaCategory = z.infer<typeof mediaCategorySchema>;

/**
 * Сквозной статус для книг, фильмов и сериалов. Значения одни, подписи разные:
 * книгу читают, фильм смотрят. Отдельные наборы для каждого вида развели бы
 * одну и ту же модель на две.
 */
export const mediaStatus = z.enum(['want', 'doing', 'done']);
export type MediaStatus = z.infer<typeof mediaStatus>;

export const MEDIA_STATUS_LABELS = {
  book: { want: 'Хочу прочитать', doing: 'Читаю', done: 'Прочитано' },
  film: { want: 'Хочу посмотреть', doing: 'Смотрю', done: 'Просмотрено' },
  series: { want: 'Хочу посмотреть', doing: 'Смотрю', done: 'Просмотрено' },
} as const;

export const mediaItemSchema = z.object({
  id: uuid,
  userId: uuid,
  kind: mediaKind,
  title: z.string().min(1).max(300),
  authorOrDirector: z.string().max(200).nullable(),
  categoryId: uuid.nullable(),
  categoryName: z.string().nullable(),
  coverUrl: z.string().max(500).nullable(),
  /** Эмодзи-заглушка обложки из прототипа. */
  coverEmoji: z.string().max(8).nullable(),
  pinned: z.boolean(),
  comment: z.string().max(2000).nullable(),
  link: z.string().max(500).nullable(),
  startedAt: dateOnly.nullable(),
  status: mediaStatus,
  rating: z.number().int().min(0).max(5),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;

export const createMediaItemSchema = z.object({
  kind: mediaKind,
  title: z.string().min(1).max(300),
  authorOrDirector: z.string().max(200).nullish(),
  categoryId: uuid.nullish(),
  coverUrl: z.string().max(500).nullish(),
  coverEmoji: z.string().max(8).nullish(),
  pinned: z.boolean().default(false),
  comment: z.string().max(2000).nullish(),
  link: z.string().max(500).nullish(),
  startedAt: dateOnly.nullish(),
  status: mediaStatus.default('want'),
  rating: z.number().int().min(0).max(5).default(0),
});
export type CreateMediaItemInput = z.infer<typeof createMediaItemSchema>;
export const updateMediaItemSchema = createMediaItemSchema.partial();
export type UpdateMediaItemInput = z.infer<typeof updateMediaItemSchema>;

export const createMediaCategorySchema = z.object({ name: z.string().min(1).max(60) });
