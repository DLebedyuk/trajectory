import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type {
  CreateReminderInput,
  Reminder,
  ReminderToTaskInput,
  SnoozeReminderInput,
  UpdateReminderInput,
} from '@planner/contracts';
import {
  addDaysToDateOnly,
  catchUpOccurrence,
  timeInTimezone,
  todayInTimezone,
} from '@planner/shared';
import { DB, type Database } from '../../db/db.module.js';
import { projects, reminders, tasks, userSettings, users } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { dateOnly, iso, isoRequired } from '../../common/mappers.js';

type Row = typeof reminders.$inferSelect;

/** Единое «вечером» для переносов и для догоняния пропущенного. */
export const EVENING_TIME = '20:00';

const toReminder = (r: Row): Reminder => ({
  id: r.id,
  userId: r.userId,
  text: r.text,
  scheduledDate: dateOnly(r.scheduledDate) as string,
  scheduledTime: r.scheduledTime,
  timezone: r.timezone,
  deliveryMode: r.deliveryMode as Reminder['deliveryMode'],
  repeatRule: r.repeatRule as Reminder['repeatRule'],
  missedBehavior: r.missedBehavior as Reminder['missedBehavior'],
  source: r.source as Reminder['source'],
  comment: r.comment,
  status: r.status as Reminder['status'],
  createdAt: isoRequired(r.createdAt),
  closedAt: iso(r.closedAt),
  updatedAt: isoRequired(r.updatedAt),
});

@Injectable()
export class RemindersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async userContext(
    userId: string,
  ): Promise<{ timezone: string; digestTime: string; missed: string }> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    const [settings] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    return {
      timezone: user?.timezone ?? 'UTC',
      digestTime: settings?.digestTime ?? '08:30',
      missed: settings?.missedReminderBehavior ?? 'evening',
    };
  }

  async listActive(userId: string): Promise<Reminder[]> {
    const rows = await this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.userId, userId), eq(reminders.status, 'active')))
      .orderBy(asc(reminders.scheduledDate), asc(reminders.scheduledTime));
    return rows.map(toReminder);
  }

  async listToday(userId: string): Promise<Reminder[]> {
    const { timezone } = await this.userContext(userId);
    const today = todayInTimezone(timezone);
    const rows = await this.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, userId),
          eq(reminders.status, 'active'),
          sql`${reminders.scheduledDate} <= ${today}`,
        ),
      )
      .orderBy(asc(reminders.scheduledTime));
    return rows.map(toReminder);
  }

  /** Архив показывает только последние семь дней — дальше интерфейс ничего не хранит на виду. */
  async archive(userId: string): Promise<Reminder[]> {
    const { timezone } = await this.userContext(userId);
    const since = addDaysToDateOnly(todayInTimezone(timezone), -7);
    const rows = await this.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, userId),
          inArray(reminders.status, ['done', 'deleted']),
          gte(reminders.closedAt, new Date(`${since}T00:00:00.000Z`)),
        ),
      )
      .orderBy(desc(reminders.closedAt));
    return rows.map(toReminder);
  }

  async get(userId: string, id: string): Promise<Reminder> {
    const [row] = await this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.userId, userId), eq(reminders.id, id)));
    if (!row) throw ApiException.notFound('Напоминание');
    return toReminder(row);
  }

  async create(userId: string, input: CreateReminderInput): Promise<Reminder> {
    const ctx = await this.userContext(userId);
    const [row] = await this.db
      .insert(reminders)
      .values({
        userId,
        text: input.text,
        scheduledDate: input.scheduledDate,
        scheduledTime: input.scheduledTime ?? null,
        timezone: ctx.timezone,
        deliveryMode: input.deliveryMode ?? (input.scheduledTime ? 'alert' : 'digest'),
        repeatRule: input.repeatRule ?? null,
        missedBehavior: input.missedBehavior ?? (ctx.missed as Reminder['missedBehavior']),
        source: input.source,
        comment: input.comment ?? null,
      })
      .returning();
    return toReminder(row as Row);
  }

  async update(userId: string, id: string, input: UpdateReminderInput): Promise<Reminder> {
    await this.get(userId, id);
    const [row] = await this.db
      .update(reminders)
      .set({
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.scheduledDate !== undefined ? { scheduledDate: input.scheduledDate } : {}),
        ...(input.scheduledTime !== undefined
          ? {
              scheduledTime: input.scheduledTime ?? null,
              deliveryMode: input.scheduledTime ? 'alert' : 'digest',
            }
          : {}),
        ...(input.deliveryMode !== undefined ? { deliveryMode: input.deliveryMode } : {}),
        ...(input.repeatRule !== undefined ? { repeatRule: input.repeatRule ?? null } : {}),
        ...(input.missedBehavior !== undefined ? { missedBehavior: input.missedBehavior } : {}),
        ...(input.comment !== undefined ? { comment: input.comment ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(reminders.userId, userId), eq(reminders.id, id)))
      .returning();
    return toReminder(row as Row);
  }

  /** Повторяющееся напоминание не закрывается, а переезжает на следующую дату. */
  async complete(userId: string, id: string): Promise<Reminder> {
    const current = await this.get(userId, id);
    if (current.repeatRule) {
      const { timezone } = await this.userContext(userId);
      const next = catchUpOccurrence(
        current.scheduledDate,
        current.repeatRule,
        todayInTimezone(timezone),
      );
      const [row] = await this.db
        .update(reminders)
        .set({ scheduledDate: next, updatedAt: new Date() })
        .where(and(eq(reminders.userId, userId), eq(reminders.id, id)))
        .returning();
      return toReminder(row as Row);
    }
    const [row] = await this.db
      .update(reminders)
      .set({ status: 'done', closedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(reminders.userId, userId), eq(reminders.id, id)))
      .returning();
    return toReminder(row as Row);
  }

  async remove(userId: string, id: string): Promise<Reminder> {
    await this.get(userId, id);
    const [row] = await this.db
      .update(reminders)
      .set({ status: 'deleted', closedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(reminders.userId, userId), eq(reminders.id, id)))
      .returning();
    return toReminder(row as Row);
  }

  /**
   * Перенос напоминания. `now` передаётся явно, чтобы поведение можно было
   * проверить тестом, и чтобы «через час» в 23:30 не уезжало в прошлое.
   */
  async snooze(
    userId: string,
    id: string,
    input: SnoozeReminderInput,
    now: Date = new Date(),
  ): Promise<Reminder> {
    const current = await this.get(userId, id);
    const { timezone } = await this.userContext(userId);
    const today = todayInTimezone(timezone, now);
    let date = current.scheduledDate;
    let time: string | null = current.scheduledTime;
    if (input.mode === 'hour') {
      const [hh, mm] = timeInTimezone(timezone, now).split(':').map(Number) as [number, number];
      const nextHour = hh + 1;
      // через полночь переносим на завтра, иначе напоминание окажется в прошлом
      date = nextHour >= 24 ? addDaysToDateOnly(today, 1) : today;
      time = `${String(nextHour % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    } else if (input.mode === 'evening') {
      // если вечер уже прошёл, «вечером» означает завтрашний вечер
      const past = timeInTimezone(timezone, now) >= EVENING_TIME;
      date = past ? addDaysToDateOnly(today, 1) : today;
      time = EVENING_TIME;
    } else if (input.mode === 'tomorrow') {
      date = addDaysToDateOnly(today, 1);
    } else {
      date = input.date ?? current.scheduledDate;
      time = input.time ?? current.scheduledTime;
    }
    const [row] = await this.db
      .update(reminders)
      .set({
        scheduledDate: date,
        scheduledTime: time,
        deliveryMode: time ? 'alert' : 'digest',
        updatedAt: new Date(),
      })
      .where(and(eq(reminders.userId, userId), eq(reminders.id, id)))
      .returning();
    return toReminder(row as Row);
  }

  /** Превращение в задачу: проект выбирает пользователь, направление берётся из проекта. */
  async convertToTask(userId: string, id: string, input: ReminderToTaskInput) {
    const reminder = await this.get(userId, id);
    const [project] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.id, input.projectId)));
    if (!project) throw ApiException.notFound('Проект');

    const [{ value } = { value: 0 }] = await this.db
      .select({ value: sql<number>`coalesce(max(${tasks.sortOrder}), -1) + 1` })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.projectId, input.projectId)));

    const [task] = await this.db
      .insert(tasks)
      .values({
        userId,
        projectId: input.projectId,
        title: reminder.text,
        deadline: input.deadline ?? null,
        estimatedDuration: input.estimatedDuration ?? null,
        comment: reminder.comment,
        sortOrder: Number(value),
      })
      .returning();

    await this.db
      .update(reminders)
      .set({ status: 'deleted', closedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(reminders.userId, userId), eq(reminders.id, id)));

    return { task, projectId: input.projectId };
  }

  /** Последнее созданное напоминание пользователя — для отмены из Telegram. */
  async lastCreated(userId: string): Promise<Reminder | null> {
    const [row] = await this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.userId, userId), eq(reminders.status, 'active')))
      .orderBy(desc(reminders.createdAt))
      .limit(1);
    return row ? toReminder(row) : null;
  }
}
