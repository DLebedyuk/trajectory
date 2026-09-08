import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type {
  CreateReminderInput,
  Reminder,
  ReminderToTaskInput,
  SnoozeReminderInput,
  TimeSlot,
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

export interface SlotTimes {
  morningTime: string;
  dayTime: string;
  eveningTime: string;
}

/** Порядок слотов внутри дня — используется, чтобы найти «ближайший следующий». */
export const SLOT_ORDER: TimeSlot[] = ['morning', 'day', 'evening'];

export function timeForSlot(slot: TimeSlot, times: SlotTimes): string {
  return slot === 'morning' ? times.morningTime : slot === 'day' ? times.dayTime : times.eveningTime;
}

const toReminder = (r: Row): Reminder => ({
  id: r.id,
  userId: r.userId,
  text: r.text,
  scheduledDate: dateOnly(r.scheduledDate) as string,
  scheduledTime: r.scheduledTime,
  timeSlot: r.timeSlot as Reminder['timeSlot'],
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
  ): Promise<{ timezone: string; missed: string } & SlotTimes> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    const [settings] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    return {
      timezone: user?.timezone ?? 'UTC',
      morningTime: settings?.morningTime ?? '10:00',
      dayTime: settings?.dayTime ?? '15:00',
      eveningTime: settings?.eveningTime ?? '21:00',
      missed: settings?.missedReminderBehavior ?? 'evening',
    };
  }

  /**
   * Слот-бакет на сегодня формируется один раз (см. idempotencyKey планировщика) —
   * напоминание без точного времени, попавшее в уже прошедший слот, физически не попадёт
   * в уже ушедший бакет. Чтобы оно не терялось и не уезжало в вечернее догоняние
   * («пропущенное»), сразу ставим его на завтра — там сработает тот же слот как обычно.
   */
  private rollPastSlot(
    date: string,
    slot: TimeSlot | null,
    ctx: { timezone: string } & SlotTimes,
    now: Date,
  ): string {
    if (!slot) return date;
    const today = todayInTimezone(ctx.timezone, now);
    if (date !== today) return date;
    if (timeInTimezone(ctx.timezone, now) < timeForSlot(slot, ctx)) return date;
    return addDaysToDateOnly(today, 1);
  }

  /**
   * «Просто напомни» без даты и времени — не переспрашиваем, а берём ближайший
   * следующий слот (утро/день/вечер); если все три сегодня уже прошли, это
   * завтрашнее утро.
   */
  private nearestSlot(
    ctx: { timezone: string } & SlotTimes,
    now: Date,
  ): { date: string; slot: TimeSlot } {
    const today = todayInTimezone(ctx.timezone, now);
    const nowTime = timeInTimezone(ctx.timezone, now);
    const upcoming = SLOT_ORDER.find((slot) => timeForSlot(slot, ctx) > nowTime);
    if (upcoming) return { date: today, slot: upcoming };
    return { date: addDaysToDateOnly(today, 1), slot: SLOT_ORDER[0] as TimeSlot };
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

  async create(
    userId: string,
    input: CreateReminderInput,
    now: Date = new Date(),
  ): Promise<Reminder> {
    const ctx = await this.userContext(userId);
    const scheduledTime = input.scheduledTime ?? null;
    const deliveryMode = input.deliveryMode ?? (scheduledTime ? 'alert' : 'digest');

    let scheduledDate = input.scheduledDate;
    let timeSlot: TimeSlot | null = null;
    if (deliveryMode === 'digest') {
      timeSlot = (input.timeSlot as TimeSlot | null | undefined) ?? null;
      if (!timeSlot) {
        /*
          Слот не выбран. Для сегодняшней даты (в том числе просто оставленной
          по умолчанию) это значит «когда угодно» — берём ближайший следующий.
          Для явно другой даты «ближайший» не имеет смысла: дата уже выбрана,
          просто ставим утро как нейтральный дефолт, не трогая саму дату.
        */
        if (scheduledDate === todayInTimezone(ctx.timezone, now)) {
          const nearest = this.nearestSlot(ctx, now);
          scheduledDate = nearest.date;
          timeSlot = nearest.slot;
        } else {
          timeSlot = 'morning';
        }
      } else {
        scheduledDate = this.rollPastSlot(scheduledDate, timeSlot, ctx, now);
      }
    }

    const [row] = await this.db
      .insert(reminders)
      .values({
        userId,
        text: input.text,
        scheduledDate,
        scheduledTime,
        timeSlot,
        timezone: ctx.timezone,
        deliveryMode,
        repeatRule: input.repeatRule ?? null,
        missedBehavior: input.missedBehavior ?? (ctx.missed as Reminder['missedBehavior']),
        source: input.source,
        comment: input.comment ?? null,
      })
      .returning();
    return toReminder(row as Row);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateReminderInput,
    now: Date = new Date(),
  ): Promise<Reminder> {
    const current = await this.get(userId, id);
    const touchesTime =
      input.scheduledDate !== undefined ||
      input.scheduledTime !== undefined ||
      input.timeSlot !== undefined;

    let timePatch: {
      scheduledDate?: string;
      scheduledTime?: string | null;
      timeSlot?: TimeSlot | null;
      deliveryMode?: 'alert' | 'digest';
    } = {};

    if (touchesTime) {
      const ctx = await this.userContext(userId);
      const scheduledTime =
        input.scheduledTime !== undefined ? (input.scheduledTime ?? null) : current.scheduledTime;
      const deliveryMode = scheduledTime ? 'alert' : 'digest';
      let scheduledDate = input.scheduledDate ?? current.scheduledDate;
      let timeSlot: TimeSlot | null = null;

      if (deliveryMode === 'digest') {
        timeSlot =
          input.timeSlot !== undefined
            ? ((input.timeSlot as TimeSlot | null | undefined) ?? null)
            : current.timeSlot;
        if (!timeSlot) {
          if (scheduledDate === todayInTimezone(ctx.timezone, now)) {
            const nearest = this.nearestSlot(ctx, now);
            scheduledDate = nearest.date;
            timeSlot = nearest.slot;
          } else {
            timeSlot = 'morning';
          }
        } else {
          scheduledDate = this.rollPastSlot(scheduledDate, timeSlot, ctx, now);
        }
      }

      timePatch = { scheduledDate, scheduledTime, timeSlot, deliveryMode };
    }

    const [row] = await this.db
      .update(reminders)
      .set({
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...timePatch,
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
    const ctx = await this.userContext(userId);
    const { timezone } = ctx;
    const today = todayInTimezone(timezone, now);
    let date = current.scheduledDate;
    let time: string | null = current.scheduledTime;
    let timeSlot: TimeSlot | null = current.timeSlot;
    if (input.mode === 'hour') {
      const [hh, mm] = timeInTimezone(timezone, now).split(':').map(Number) as [number, number];
      const nextHour = hh + 1;
      // через полночь переносим на завтра, иначе напоминание окажется в прошлом
      date = nextHour >= 24 ? addDaysToDateOnly(today, 1) : today;
      time = `${String(nextHour % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      timeSlot = null;
    } else if (input.mode === 'evening') {
      // «вечером» — тот же настраиваемый слот, что и в остальном приложении;
      // если он уже прошёл сегодня, значит имелся в виду завтрашний вечер
      date = this.rollPastSlot(today, 'evening', ctx, now);
      time = null;
      timeSlot = 'evening';
    } else if (input.mode === 'tomorrow') {
      date = addDaysToDateOnly(today, 1);
    } else {
      date = input.date ?? current.scheduledDate;
      time = input.time ?? current.scheduledTime;
      timeSlot = time ? null : current.timeSlot;
    }
    const [row] = await this.db
      .update(reminders)
      .set({
        scheduledDate: date,
        scheduledTime: time,
        timeSlot,
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
