import { z } from 'zod';
import { dateOnly, uuid } from './common.js';

export const touchSchema = z.object({
  id: uuid,
  userId: uuid,
  directionId: uuid,
  projectId: uuid.nullable(),
  date: dateOnly,
  title: z.string().min(1).max(300),
  comment: z.string().max(2000).nullable(),
  createdAt: z.string().datetime(),
});
export type Touch = z.infer<typeof touchSchema>;

export const touchWithContextSchema = touchSchema.extend({
  directionName: z.string(),
  directionColor: z.string(),
  projectTitle: z.string().nullable(),
});
export type TouchWithContext = z.infer<typeof touchWithContextSchema>;

export const createTouchSchema = z.object({
  directionId: uuid,
  projectId: uuid.nullish(),
  date: dateOnly,
  title: z.string().min(1).max(300),
  comment: z.string().max(2000).nullish(),
});
export type CreateTouchInput = z.infer<typeof createTouchSchema>;

export const touchQuerySchema = z.object({
  directionId: uuid.optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type TouchQuery = z.infer<typeof touchQuerySchema>;

/** Одна ячейка карты касаний: день + разбивка по направлениям. */
export const heatmapDaySchema = z.object({
  date: dateOnly,
  total: z.number().int(),
  directions: z.array(z.object({ directionId: uuid, color: z.string(), count: z.number().int() })),
});
export type HeatmapDay = z.infer<typeof heatmapDaySchema>;

export const heatmapSchema = z.object({
  from: dateOnly,
  to: dateOnly,
  days: z.array(heatmapDaySchema),
  weekTotal: z.number().int(),
  total: z.number().int(),
});
export type Heatmap = z.infer<typeof heatmapSchema>;
