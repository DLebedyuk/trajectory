import { z } from 'zod';
import { timeOfDay, uuid } from './common.js';

export const userSchema = z.object({
  id: uuid,
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  avatarUrl: z.string().nullable().default(null),
  timezone: z.string().min(1),
  locale: z.string().min(2).max(10),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;

export const settingsSchema = z.object({
  userId: uuid,
  timezone: z.string().min(1),
  locale: z.string().min(2).max(10),
  /** Время по умолчанию для напоминаний без точного времени: утро/день/вечер. */
  morningTime: timeOfDay,
  dayTime: timeOfDay,
  eveningTime: timeOfDay,
  /** «Переспросить»: пропущенное дублируется в каждой следующей сводке (true) или напомнит один раз (false). */
  missedReminderRepeat: z.boolean(),
  /** Раздел «Сегодня» (календарь + дедлайны задач) в утреннем сообщении Telegram. */
  morningDigestEnabled: z.boolean(),
  theme: z.enum(['light', 'dark', 'system']),
  telegramLinked: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsSchema = z.object({
  timezone: z.string().min(1).optional(),
  locale: z.string().min(2).max(10).optional(),
  morningTime: timeOfDay.optional(),
  dayTime: timeOfDay.optional(),
  eveningTime: timeOfDay.optional(),
  missedReminderRepeat: z.boolean().optional(),
  morningDigestEnabled: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
