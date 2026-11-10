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
  /** Столбец доски. Нет — первый столбец направления. */
  boardColumnId: uuid.nullish(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

// столбец меняется отдельной ручкой /move: перенос из «Готово» — это ещё и
// возврат задачи, общий PATCH этого не умеет
export const updateTaskSchema = createTaskSchema
  .omit({ projectId: true, boardColumnId: true })
  .partial();
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/**
 * Завершение задачи. withTouch решается в момент закрытия, а не при создании:
 * заранее не всегда понятно, окажется задача занятием или бытовой мелочью.
 */
export const completeTaskSchema = z.object({
  withTouch: z.boolean().default(false),
  /** День касания. Задачу могли сделать вчера, а закрыть в приложении сегодня. Нет — сегодня. */
  touchDate: dateOnly.optional(),
});
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

/**
 * Карточка канбан-доски направления: обычная задача плюс то, что нужно
 * карточке без отдельного запроса. Это представление, а не копия задачи.
 */
export const boardTaskSchema = taskSchema.extend({
  projectTitle: z.string(),
  /** Та самая единственная активная задача приложения. */
  isActive: z.boolean(),
  /**
   * Столбец доски. NULL — первый столбец. Сервер отдаёт NULL и тогда, когда
   * сохранённый столбец не из этого направления (проект перенесли).
   */
  boardColumnId: uuid.nullable(),
});
export type BoardTask = z.infer<typeof boardTaskSchema>;

export const boardProjectSchema = z.object({
  id: uuid,
  title: z.string(),
  status: z.string(),
  sortOrder: z.number().int(),
});
export type BoardProject = z.infer<typeof boardProjectSchema>;

/**
 * Столбец доски — стадия открытой задачи. «Готово» в список не входит: это
 * статус done, он есть на любой доске.
 */
export const boardColumnSchema = z.object({
  id: uuid,
  directionId: uuid,
  title: z.string(),
  sortOrder: z.number().int(),
});
export type BoardColumn = z.infer<typeof boardColumnSchema>;

export const boardColumnTitle = z.string().trim().min(1).max(40);
export const createBoardColumnSchema = z.object({ directionId: uuid, title: boardColumnTitle });
export type CreateBoardColumnInput = z.infer<typeof createBoardColumnSchema>;
export const updateBoardColumnSchema = z.object({ title: boardColumnTitle });
export type UpdateBoardColumnInput = z.infer<typeof updateBoardColumnSchema>;

/** Перенос карточки. null — в первый столбец. Из «Готово» задача заодно возвращается. */
export const moveTaskSchema = z.object({ boardColumnId: uuid.nullable() });
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

/** Доска направления: проекты, включённые в неё, и все их задачи — открытые и готовые. */
export const boardSchema = z.object({
  /** Пусто — у доски один столбец открытых задач, как раньше. */
  columns: z.array(boardColumnSchema),
  projects: z.array(boardProjectSchema),
  tasks: z.array(boardTaskSchema),
});
export type Board = z.infer<typeof boardSchema>;
