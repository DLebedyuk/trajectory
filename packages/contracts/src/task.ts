import { z } from 'zod';
import { dateOnly, estimatedDuration, taskStatus, timeOfDay, uuid } from './common.js';

export const checklistItemSchema = z.object({
  id: uuid,
  taskId: uuid,
  text: z.string().min(1).max(300),
  completed: z.boolean(),
  sortOrder: z.number().int(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const taskSchema = z.object({
  id: uuid,
  userId: uuid,
  projectId: uuid,
  title: z.string().min(1).max(300),
  status: taskStatus,
  pinned: z.boolean(),
  deadline: dateOnly.nullable(),
  exactTime: timeOfDay.nullable(),
  estimatedDuration: estimatedDuration.nullable(),
  remindAt: dateOnly.nullable(),
  comment: z.string().max(4000).nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  checklist: z.array(checklistItemSchema).default([]),
});
export type Task = z.infer<typeof taskSchema>;

/** Задача вместе с проектом и направлением — формат «проект → задача → направление». */
export const taskWithContextSchema = taskSchema.extend({
  projectTitle: z.string(),
  directionId: uuid,
  directionName: z.string(),
  directionColor: z.string(),
});
export type TaskWithContext = z.infer<typeof taskWithContextSchema>;

export const createTaskSchema = z.object({
  projectId: uuid,
  title: z.string().min(1).max(300),
  deadline: dateOnly.nullish(),
  exactTime: timeOfDay.nullish(),
  estimatedDuration: estimatedDuration.nullish(),
  remindAt: dateOnly.nullish(),
  comment: z.string().max(4000).nullish(),
  pinned: z.boolean().default(false),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.omit({ projectId: true }).partial();
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/**
 * Завершение задачи. withTouch решается в момент закрытия, а не при создании:
 * заранее не всегда понятно, окажется задача занятием или бытовой мелочью.
 */
export const completeTaskSchema = z.object({ withTouch: z.boolean().default(false) });
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;

export const createChecklistItemSchema = z.object({ text: z.string().min(1).max(300) });
export const updateChecklistItemSchema = z.object({
  text: z.string().min(1).max(300).optional(),
  completed: z.boolean().optional(),
});

export const taskFilterSchema = z.object({
  estimatedDuration: estimatedDuration.optional(),
  withDeadlineOnly: z.coerce.boolean().optional(),
  status: taskStatus.optional(),
  sort: z.enum(['manual', 'deadline', 'pinned']).optional(),
});
export type TaskFilter = z.infer<typeof taskFilterSchema>;
