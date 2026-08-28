import { z } from 'zod';
import { missedBehavior, timeOfDay, uuid } from './common.js';

export const userSchema = z.object({
  id: uuid,
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
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
  digestTime: timeOfDay,
  missedReminderBehavior: missedBehavior,
  theme: z.enum(['light', 'dark', 'system']),
  hardNotifications: z.boolean(),
  softNotifications: z.boolean(),
  telegramLinked: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsSchema = z.object({
  timezone: z.string().min(1).optional(),
  locale: z.string().min(2).max(10).optional(),
  digestTime: timeOfDay.optional(),
  missedReminderBehavior: missedBehavior.optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  hardNotifications: z.boolean().optional(),
  softNotifications: z.boolean().optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
