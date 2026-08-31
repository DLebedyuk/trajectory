import { z } from 'zod';
import { dateOnly, projectStatus, uuid } from './common.js';

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
