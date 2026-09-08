import { z } from 'zod';
import {
  dateOnly,
  deliveryMode,
  deliveryStatus,
  missedBehavior,
  reminderSource,
  reminderStatus,
  timeOfDay,
  timeSlot,
  uuid,
} from './common.js';
import { estimatedDuration } from './common.js';

/** Простое правило повтора. null — не повторять. */
export const repeatRuleSchema = z.enum(['daily', 'weekly', 'monthly']);
export type RepeatRule = z.infer<typeof repeatRuleSchema>;

export const reminderSchema = z.object({
  id: uuid,
  userId: uuid,
  text: z.string().min(1).max(500),
  scheduledDate: dateOnly,
  scheduledTime: timeOfDay.nullable(),
  timeSlot: timeSlot.nullable(),
  timezone: z.string().min(1),
  deliveryMode,
  repeatRule: repeatRuleSchema.nullable(),
  missedBehavior,
  source: reminderSource,
  comment: z.string().max(2000).nullable(),
  status: reminderStatus,
  createdAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});
export type Reminder = z.infer<typeof reminderSchema>;

export const createReminderSchema = z.object({
  text: z.string().min(1).max(500),
  scheduledDate: dateOnly,
  scheduledTime: timeOfDay.nullish(),
  /**
   * Слот по умолчанию (утро/день/вечер), если точного времени нет. Ни то ни
   * другое не задано — сервис сам подбирает ближайший следующий слот.
   * deliveryMode здесь намеренно нет: его вычисляет RemindersService из
   * scheduledTime, чтобы их нельзя было прислать в противоречии друг другу.
   */
  timeSlot: timeSlot.nullish(),
  repeatRule: repeatRuleSchema.nullish(),
  missedBehavior: missedBehavior.optional(),
  source: reminderSource.default('web'),
  comment: z.string().max(2000).nullish(),
});
export type CreateReminderInput = z.infer<typeof createReminderSchema>;

export const updateReminderSchema = createReminderSchema.partial();
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;

export const snoozeReminderSchema = z.object({
  mode: z.enum(['hour', 'evening', 'tomorrow', 'date']),
  date: dateOnly.optional(),
  time: timeOfDay.optional(),
});
export type SnoozeReminderInput = z.infer<typeof snoozeReminderSchema>;

export const reminderToTaskSchema = z.object({
  projectId: uuid,
  deadline: dateOnly.nullish(),
  estimatedDuration: estimatedDuration.nullish(),
});
export type ReminderToTaskInput = z.infer<typeof reminderToTaskSchema>;

export const reminderDeliverySchema = z.object({
  id: uuid,
  reminderId: uuid,
  scheduledFor: z.string().datetime(),
  channel: z.string(),
  status: deliveryStatus,
  attemptCount: z.number().int(),
  sentAt: z.string().datetime().nullable(),
  error: z.string().nullable(),
  idempotencyKey: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReminderDelivery = z.infer<typeof reminderDeliverySchema>;
