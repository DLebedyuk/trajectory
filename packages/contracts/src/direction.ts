import { z } from 'zod';
import { dateOnly, uuid } from './common.js';

export const directionSchema = z.object({
  id: uuid,
  userId: uuid,
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable(),
  color: z.string().min(1).max(40),
  icon: z.string().min(1).max(40),
  motto: z.string().max(300).nullable(),
  showMotto: z.boolean(),
  sortOrder: z.number().int(),
  notes: z.array(z.string().max(2000)),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Direction = z.infer<typeof directionSchema>;

export const createDirectionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullish(),
  color: z.string().min(1).max(40).default('--d-eng'),
  icon: z.string().min(1).max(40).default('spark'),
  motto: z.string().max(300).nullish(),
  showMotto: z.boolean().default(true),
  notes: z.array(z.string().max(2000)).default([]),
});
export type CreateDirectionInput = z.infer<typeof createDirectionSchema>;

export const updateDirectionSchema = createDirectionSchema.partial();
export type UpdateDirectionInput = z.infer<typeof updateDirectionSchema>;

export const directionWithStatsSchema = directionSchema.extend({
  touchCount: z.number().int(),
  lastTouchDate: dateOnly.nullable(),
});
export type DirectionWithStats = z.infer<typeof directionWithStatsSchema>;
