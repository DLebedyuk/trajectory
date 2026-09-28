import { z } from 'zod';
import { uuid } from './common.js';

/**
 * Привычка — пункт личного чеклиста «чем заняться, когда есть время».
 * Принадлежит направлению, но это не проект и не задача: ни срока, ни
 * статуса, ни обязательности. Сделанное записывается касанием.
 */
export const habitSchema = z.object({
  id: uuid,
  directionId: uuid,
  title: z.string().min(1).max(200),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
});
export type Habit = z.infer<typeof habitSchema>;

export const habitWithContextSchema = habitSchema.extend({
  directionName: z.string(),
  directionColor: z.string(),
});
export type HabitWithContext = z.infer<typeof habitWithContextSchema>;

export const createHabitSchema = z.object({
  directionId: uuid,
  title: z.string().trim().min(1).max(200),
});
export type CreateHabitInput = z.infer<typeof createHabitSchema>;

export const updateHabitSchema = z.object({
  title: z.string().trim().min(1).max(200),
});
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
