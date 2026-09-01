import { z } from 'zod';

export const uuid = z.string().uuid();
/** Календарная дата без времени, YYYY-MM-DD. */
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ожидается YYYY-MM-DD');
/** Время суток HH:MM. */
export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'ожидается HH:MM');

export const estimatedDuration = z.enum(['short', 'medium', 'long']);
export type EstimatedDuration = z.infer<typeof estimatedDuration>;

export const projectStatus = z.enum(['active', 'paused', 'archived']);
export type ProjectStatus = z.infer<typeof projectStatus>;

export const taskStatus = z.enum(['open', 'done']);
export type TaskStatus = z.infer<typeof taskStatus>;

export const deliveryMode = z.enum(['digest', 'alert']);
export type DeliveryMode = z.infer<typeof deliveryMode>;

export const missedBehavior = z.enum(['none', 'evening', 'nextDigest']);
export type MissedBehavior = z.infer<typeof missedBehavior>;

export const reminderStatus = z.enum(['active', 'done', 'deleted']);
export type ReminderStatus = z.infer<typeof reminderStatus>;

export const reminderSource = z.enum(['web', 'telegram']);
export type ReminderSource = z.infer<typeof reminderSource>;

export const deliveryStatus = z.enum(['pending', 'processing', 'sent', 'failed']);
export type DeliveryStatus = z.infer<typeof deliveryStatus>;

export const mediaKind = z.enum(['book', 'film', 'series']);
export type MediaKind = z.infer<typeof mediaKind>;

export const inboxStatus = z.enum(['new', 'processed', 'deleted']);
export type InboxStatus = z.infer<typeof inboxStatus>;

/**
 * Во что можно превратить входящую запись. Типа «заметка в проект» здесь
 * больше нет: заметка не создаёт ничего, что потом можно найти или закрыть,
 * и запись просто растворялась в чужом проекте.
 */
export const inboxProposedType = z.enum([
  'task',
  'project',
  'reminder',
  'menu',
  'book',
  'film',
  'keep',
]);
export type InboxProposedType = z.infer<typeof inboxProposedType>;

/** Единый формат ошибки API. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const ERROR_CODES = {
  VALIDATION: 'validation_error',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  UNAUTHORIZED: 'unauthorized',
  INTERNAL: 'internal_error',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const reorderSchema = z.object({ ids: z.array(uuid).min(1) });
export type ReorderInput = z.infer<typeof reorderSchema>;
