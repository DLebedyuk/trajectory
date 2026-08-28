import { z } from 'zod';
import { uuid } from './common.js';
import { taskWithContextSchema } from './task.js';
import { directionSchema } from './direction.js';

export const focusSchema = z.object({
  focusDirectionId: uuid.nullable(),
  activeTaskId: uuid.nullable(),
  direction: directionSchema.nullable(),
  activeTask: taskWithContextSchema.nullable(),
});
export type Focus = z.infer<typeof focusSchema>;

/**
 * Смена направления в фокусе. Если активная задача принадлежит другому
 * направлению, сервер отвечает 409 и клиент показывает выбор:
 * keepTask (не менять направление) | clearTask (сменить и очистить активную).
 */
export const setFocusDirectionSchema = z.object({
  directionId: uuid.nullable(),
  onConflict: z.enum(['ask', 'keepTask', 'clearTask']).default('ask'),
});
export type SetFocusDirectionInput = z.infer<typeof setFocusDirectionSchema>;

export const setActiveTaskSchema = z.object({ taskId: uuid.nullable() });
export type SetActiveTaskInput = z.infer<typeof setActiveTaskSchema>;

export const focusConflictSchema = z.object({
  code: z.literal('focus_direction_conflict'),
  message: z.string(),
  activeTaskId: uuid,
  activeTaskTitle: z.string(),
  activeTaskDirectionId: uuid,
  activeTaskDirectionName: z.string(),
  requestedDirectionId: uuid,
  requestedDirectionName: z.string(),
});
export type FocusConflict = z.infer<typeof focusConflictSchema>;
