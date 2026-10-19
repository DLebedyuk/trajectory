import { z } from 'zod';
import { dateOnly, projectPriority, projectStatus, uuid } from './common.js';

export const projectSchema = z.object({
  id: uuid,
  userId: uuid,
  directionId: uuid,
  title: z.string().min(1).max(200),
  desiredOutcome: z.string().max(2000).nullable(),
  status: projectStatus,
  deadline: dateOnly.nullable(),
  sortOrder: z.number().int(),
  notes: z.array(z.string()),
  /**
   * Закреплён — значит виден в «Обзоре». Закреплённых проектов может быть
   * сколько угодно, и к фокусу на главной закрепление отношения не имеет.
   */
  pinned: z.boolean(),
  priority: projectPriority.nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectSchema = z.object({
  directionId: uuid,
  title: z.string().min(1).max(200),
  desiredOutcome: z.string().max(2000).nullish(),
  status: projectStatus.default('active'),
  deadline: dateOnly.nullish(),
  notes: z.array(z.string()).default([]),
  pinned: z.boolean().optional(),
  priority: projectPriority.nullish(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Статус здесь намеренно отсутствует. Завершение и возврат проекта — это не
 * правка поля: вместе со статусом закрываются задачи, снимается фокус,
 * пишется дата завершения. Через общий PATCH всё это обходилось, и проект
 * оказывался «завершённым» с живыми открытыми задачами внутри.
 * Статус меняется только через /archive и /restore.
 */
export const updateProjectSchema = createProjectSchema
  .partial()
  .omit({ status: true })
  // strict, а не strip: попытка сменить статус этой ручкой должна быть видимой
  // ошибкой, а не молча выброшенным полем
  .strict();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** Проект + признаки «есть активная задача» / «сколько закреплено» для сортировки по весу. */
export const projectWithFlagsSchema = projectSchema.extend({
  pinnedCount: z.number().int(),
  hasActiveTask: z.boolean(),
  activeTaskTitle: z.string().nullable(),
  openTaskCount: z.number().int(),
});
export type ProjectWithFlags = z.infer<typeof projectWithFlagsSchema>;

/** Проект в «Обзоре»: вместе с направлением и счётчиками задач. */
export const overviewProjectSchema = projectSchema.extend({
  directionName: z.string(),
  directionColor: z.string(),
  openTaskCount: z.number().int(),
  doneTaskCount: z.number().int(),
  overdueTaskCount: z.number().int(),
  /** Ближайший срок — самого проекта или его открытой задачи. */
  nextDeadline: dateOnly.nullable(),
  hasActiveTask: z.boolean(),
});
export type OverviewProject = z.infer<typeof overviewProjectSchema>;

export const overviewScope = z.enum(['pinned', 'all']);
export type OverviewScope = z.infer<typeof overviewScope>;

/**
 * Общая картина. Счётчики всегда по всем живым направлениям, независимо от
 * scope: переключатель меняет список проектов, а не цифры наверху.
 */
export const overviewSchema = z.object({
  stats: z.object({
    directions: z.number().int(),
    projects: z.number().int(),
    pinned: z.number().int(),
    openTasks: z.number().int(),
    overdueTasks: z.number().int(),
  }),
  /** Порядок: направления по их порядку, внутри — по ручному порядку проектов. */
  projects: z.array(overviewProjectSchema),
});
export type Overview = z.infer<typeof overviewSchema>;
