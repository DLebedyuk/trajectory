import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, gte, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';
import { addDaysToDateOnly, todayInTimezone, toDateOnly, zonedDateTimeToUtc } from '@planner/shared';
import type { TimeSlot } from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import {
  calendarEvents,
  calendars,
  reminderDeliveries,
  reminders,
  tasks,
  userSettings,
  users,
} from '../../db/schema.js';
import { NOTIFICATION_PROVIDER } from './notification.token.js';
import type { NotificationProvider } from './providers/notification.provider.js';
import { SLOT_ORDER, timeForSlot, type SlotTimes } from './reminders.service.js';

const MAX_ATTEMPTS = 3;

/** Текст-заголовок бакета — одинаковый для «настоящих» и «догоняющих» напоминаний слота. */
const SLOT_HEADER: Record<'day' | 'evening', string> = {
  day: 'Днём Вы хотели:',
  evening: 'Вечером Вы хотели:',
};

/*
  Утреннее сообщение — единственное с двумя разделами: «Сегодня» (дела из
  календаря + задачи с дедлайном сегодня или завтра) и «Напоминания» (то же,
  что и раньше — напоминания слота и задачи с remindAt). Раздел появляется,
  только если в нём реально есть строки — иначе сообщение выглядело бы как
  пустой заголовок без содержания.
*/
const MORNING_GREETING = 'Доброе утро.';
const MORNING_DIGEST_HEADER = 'Сегодня:';
const MORNING_REMINDERS_HEADER = 'Напоминания:';

interface PlannedDelivery {
  userId: string;
  /** Доставка относится либо к напоминанию, либо к задаче, либо ни к чему (сводка). */
  reminderId: string | null;
  taskId: string | null;
  scheduledFor: Date;
  idempotencyKey: string;
  text: string;
  /**
   * Разово пропущенные (missedReminderRepeat=false) напоминания и задачи,
   * догнанные этой доставкой. missedNotified для них выставляется только
   * после успешной provider.send() — иначе сбой доставки «сжигает» их
   * единственный шанс, а повторная попытка planMissed() их больше не находит.
   */
  onceMissedReminderIds: string[];
  onceMissedTaskIds: string[];
}

interface Bucket {
  delivery: PlannedDelivery;
  /** Напоминания слота и задачи с remindAt — как было всегда. */
  lines: string[];
  /** Только для утра: дела из календаря и задачи с дедлайном сегодня/завтра. */
  digestLines: string[];
}

/**
 * Серверная обработка напоминаний. Работает без Redis: идемпотентность
 * обеспечивает уникальный ключ доставки, а атомарный захват — условный UPDATE.
 */
@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger('ReminderScheduler');
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processDue(new Date());
    } catch (e) {
      this.logger.error(e instanceof Error ? e.message : String(e));
    } finally {
      this.running = false;
    }
  }

  /** Вынесено отдельным методом, чтобы вызывать из тестов с фиксированным «сейчас». */
  async processDue(now: Date): Promise<number> {
    const planned = await this.plan(now);
    let sent = 0;
    for (const item of planned) {
      const claimed = await this.claim(item);
      if (!claimed) continue;
      try {
        await this.provider.send({ userId: item.userId, text: item.text });
        await this.db
          .update(reminderDeliveries)
          .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
          .where(eq(reminderDeliveries.id, claimed.id));
        // единственный шанс на догонку считается использованным только теперь,
        // когда сообщение реально ушло — не раньше
        if (item.onceMissedReminderIds.length > 0) {
          await this.db
            .update(reminders)
            .set({ missedNotified: true })
            .where(inArray(reminders.id, item.onceMissedReminderIds));
        }
        if (item.onceMissedTaskIds.length > 0) {
          await this.db
            .update(tasks)
            .set({ missedNotified: true })
            .where(inArray(tasks.id, item.onceMissedTaskIds));
        }
        sent += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const attempts = claimed.attemptCount;
        await this.db
          .update(reminderDeliveries)
          .set({
            status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            error: message,
            updatedAt: new Date(),
          })
          .where(eq(reminderDeliveries.id, claimed.id));
        this.logger.warn(`Доставка ${claimed.id} не удалась (попытка ${attempts}): ${message}`);
      }
    }
    return sent;
  }

  /**
   * Собирает список того, что уже пора отправить: точечные алерты, три
   * именованных слота (утро/день/вечер) — свои у напоминаний и у задач —
   * и вечернее догоняние пропущенного.
   */
  private async plan(now: Date): Promise<PlannedDelivery[]> {
    /*
      Без этого фильтра запрос вытягивал вообще все активные напоминания и
      открытые задачи с remindAt во всей системе — включая те, что назначены
      на через полгода — и только потом отбрасывал будущее в JS. cutoffDate —
      самая поздняя календарная дата, которая прямо сейчас вообще может
      считаться «сегодня» хоть в одном часовом поясе на Земле (UTC+14); дата
      позже этого гарантированно ещё не наступила нигде, значит её можно
      безопасно исключить в SQL, не трогая саму логику «наступило/не наступило».
    */
    const cutoffDate = toDateOnly(new Date(now.getTime() + 14 * 60 * 60 * 1000));
    const alerts: PlannedDelivery[] = [];
    const buckets: Record<TimeSlot, Map<string, Bucket>> = {
      morning: new Map(),
      day: new Map(),
      evening: new Map(),
    };

    const bucketFor = (
      slot: TimeSlot,
      userId: string,
      today: string,
      at: Date,
      line: string,
      once?: { reminderId?: string; taskId?: string },
    ): void => {
      const key = `${slot}:${userId}:${today}`;
      const existing = buckets[slot].get(key);
      if (existing) {
        existing.lines.push(line);
        if (once?.reminderId) existing.delivery.onceMissedReminderIds.push(once.reminderId);
        if (once?.taskId) existing.delivery.onceMissedTaskIds.push(once.taskId);
        return;
      }
      buckets[slot].set(key, {
        delivery: {
          userId,
          reminderId: null,
          taskId: null,
          scheduledFor: at,
          idempotencyKey: key,
          text: '',
          onceMissedReminderIds: once?.reminderId ? [once.reminderId] : [],
          onceMissedTaskIds: once?.taskId ? [once.taskId] : [],
        },
        lines: [line],
        digestLines: [],
      });
    };

    /*
      Тот же бакет по ключу «morning:userId:today», что и bucketFor — календарь
      и дедлайны попадают в ту же доставку, что и напоминания того же утра, а
      не улетают вторым отдельным сообщением. once не нужен: сводка не
      участвует в системе «пропущено/догнать».
    */
    const digestFor = (userId: string, today: string, at: Date, line: string): void => {
      const key = `morning:${userId}:${today}`;
      const existing = buckets.morning.get(key);
      if (existing) {
        existing.digestLines.push(line);
        return;
      }
      buckets.morning.set(key, {
        delivery: {
          userId,
          reminderId: null,
          taskId: null,
          scheduledFor: at,
          idempotencyKey: key,
          text: '',
          onceMissedReminderIds: [],
          onceMissedTaskIds: [],
        },
        lines: [],
        digestLines: [line],
      });
    };

    const reminderRows = await this.db
      .select({
        reminder: reminders,
        timezone: users.timezone,
        morningTime: userSettings.morningTime,
        dayTime: userSettings.dayTime,
        eveningTime: userSettings.eveningTime,
        missedRepeat: userSettings.missedReminderRepeat,
      })
      .from(reminders)
      .innerJoin(users, eq(users.id, reminders.userId))
      .leftJoin(userSettings, eq(userSettings.userId, reminders.userId))
      .where(and(eq(reminders.status, 'active'), lte(reminders.scheduledDate, cutoffDate)));

    for (const row of reminderRows) {
      const r = row.reminder;
      const timezone = r.timezone || row.timezone || 'UTC';
      const today = todayInTimezone(timezone, now);
      const date = String(r.scheduledDate).slice(0, 10);
      const slotTimes: SlotTimes = {
        morningTime: row.morningTime ?? '10:00',
        dayTime: row.dayTime ?? '15:00',
        eveningTime: row.eveningTime ?? '21:00',
      };

      if (date > today) continue;

      if (date < today) {
        const repeat = row.missedRepeat ?? true;
        const target = this.planMissed(repeat, r.missedNotified, {
          ownSlot: (r.timeSlot as TimeSlot | null) ?? 'morning',
          timezone,
          today,
          now,
          slotTimes,
        });
        if (target) {
          bucketFor(
            target.slot,
            r.userId,
            today,
            target.at,
            r.text,
            repeat ? undefined : { reminderId: r.id },
          );
        }
        continue;
      }

      if (r.deliveryMode === 'alert' && r.scheduledTime) {
        const at = zonedDateTimeToUtc(date, r.scheduledTime, timezone);
        if (at <= now) {
          alerts.push({
            userId: r.userId,
            reminderId: r.id,
            taskId: null,
            scheduledFor: at,
            idempotencyKey: `alert:${r.id}:${date}:${r.scheduledTime}`,
            text: `Напоминание: ${r.text}`,
            onceMissedReminderIds: [],
            onceMissedTaskIds: [],
          });
        }
        continue;
      }

      const slot = (r.timeSlot as TimeSlot | null) ?? 'morning';
      const at = zonedDateTimeToUtc(date, timeForSlot(slot, slotTimes), timezone);
      if (at > now) continue;
      bucketFor(slot, r.userId, today, at, r.text);
    }

    const taskRows = await this.db
      .select({
        id: tasks.id,
        userId: tasks.userId,
        title: tasks.title,
        remindAt: tasks.remindAt,
        missedNotified: tasks.missedNotified,
        timezone: users.timezone,
        morningTime: userSettings.morningTime,
        missedRepeat: userSettings.missedReminderRepeat,
      })
      .from(tasks)
      .innerJoin(users, eq(users.id, tasks.userId))
      .leftJoin(userSettings, eq(userSettings.userId, tasks.userId))
      .where(
        and(
          eq(tasks.status, 'open'),
          isNotNull(tasks.remindAt),
          lte(tasks.remindAt, cutoffDate),
        ),
      );

    for (const t of taskRows) {
      const timezone = t.timezone || 'UTC';
      const today = todayInTimezone(timezone, now);
      const date = String(t.remindAt).slice(0, 10);
      // у задач нет своего слота — они всегда идут утром, как раньше шла общая сводка
      const slotTimes: SlotTimes = {
        morningTime: t.morningTime ?? '10:00',
        dayTime: '15:00',
        eveningTime: '21:00',
      };
      if (date > today) continue;

      const line = `${t.title} — задача`;
      if (date < today) {
        const repeat = t.missedRepeat ?? true;
        const target = this.planMissed(repeat, t.missedNotified, {
          ownSlot: 'morning',
          timezone,
          today,
          now,
          slotTimes,
        });
        if (target) {
          bucketFor(
            target.slot,
            t.userId,
            today,
            target.at,
            line,
            repeat ? undefined : { taskId: t.id },
          );
        }
        continue;
      }

      const at = zonedDateTimeToUtc(date, slotTimes.morningTime, timezone);
      if (at > now) continue;
      bucketFor('morning', t.userId, today, at, line);
    }

    /*
      Утренняя сводка: дела из календаря на сегодня и задачи с дедлайном
      сегодня или завтра. И то и другое до сих пор не попадало в Telegram
      вообще — только показывалось на главной странице веба. Окно выборки —
      тот же приём cutoffDate/coarseDate, что и выше: широкая, заведомо
      безопасная граница в SQL, точная проверка «какой сегодня день у этого
      человека» — уже в JS.
    */
    const coarseLow = toDateOnly(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const coarseHigh = toDateOnly(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000));

    const calendarRows = await this.db
      .select({
        userId: calendarEvents.userId,
        title: calendarEvents.title,
        date: calendarEvents.date,
        time: calendarEvents.time,
        allDay: calendarEvents.allDay,
        timezone: users.timezone,
        morningTime: userSettings.morningTime,
        morningDigestEnabled: userSettings.morningDigestEnabled,
      })
      .from(calendarEvents)
      .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
      .innerJoin(users, eq(users.id, calendarEvents.userId))
      .leftJoin(userSettings, eq(userSettings.userId, calendarEvents.userId))
      .where(
        and(
          eq(calendars.enabled, true),
          gte(calendarEvents.date, coarseLow),
          lte(calendarEvents.date, coarseHigh),
        ),
      )
      .orderBy(calendarEvents.time);

    for (const row of calendarRows) {
      if (row.morningDigestEnabled === false) continue;
      const timezone = row.timezone || 'UTC';
      const today = todayInTimezone(timezone, now);
      const date = String(row.date).slice(0, 10);
      if (date !== today) continue;

      const morningTime = row.morningTime ?? '10:00';
      const at = zonedDateTimeToUtc(today, morningTime, timezone);
      if (at > now) continue;

      const line = row.allDay ? row.title : `${row.time} — ${row.title}`;
      digestFor(row.userId, today, at, line);
    }

    const deadlineTaskRows = await this.db
      .select({
        userId: tasks.userId,
        title: tasks.title,
        deadline: tasks.deadline,
        timezone: users.timezone,
        morningTime: userSettings.morningTime,
        morningDigestEnabled: userSettings.morningDigestEnabled,
      })
      .from(tasks)
      .innerJoin(users, eq(users.id, tasks.userId))
      .leftJoin(userSettings, eq(userSettings.userId, tasks.userId))
      .where(
        and(
          eq(tasks.status, 'open'),
          isNotNull(tasks.deadline),
          gte(tasks.deadline, coarseLow),
          lte(tasks.deadline, coarseHigh),
        ),
      )
      .orderBy(tasks.deadline);

    for (const row of deadlineTaskRows) {
      if (row.morningDigestEnabled === false) continue;
      const timezone = row.timezone || 'UTC';
      const today = todayInTimezone(timezone, now);
      const tomorrow = addDaysToDateOnly(today, 1);
      const deadline = String(row.deadline).slice(0, 10);
      if (deadline !== today && deadline !== tomorrow) continue;

      const morningTime = row.morningTime ?? '10:00';
      const at = zonedDateTimeToUtc(today, morningTime, timezone);
      if (at > now) continue;

      const line = `${row.title} — дедлайн ${deadline === today ? 'сегодня' : 'завтра'}`;
      digestFor(row.userId, today, at, line);
    }

    for (const bucket of buckets.morning.values()) {
      const parts: string[] = [];
      if (bucket.digestLines.length > 0) {
        parts.push(`${MORNING_DIGEST_HEADER}\n${bucket.digestLines.map((l) => `— ${l}`).join('\n')}`);
      }
      if (bucket.lines.length > 0) {
        parts.push(`${MORNING_REMINDERS_HEADER}\n${bucket.lines.map((l) => `— ${l}`).join('\n')}`);
      }
      bucket.delivery.text = `${MORNING_GREETING}\n\n${parts.join('\n\n')}`;
    }
    for (const slot of ['day', 'evening'] as const) {
      for (const bucket of buckets[slot].values()) {
        bucket.delivery.text = `${SLOT_HEADER[slot]}\n${bucket.lines.map((l) => `— ${l}`).join('\n')}`;
      }
    }

    return [
      ...alerts,
      ...SLOT_ORDER.flatMap((slot) => [...buckets[slot].values()].map((b) => b.delivery)),
    ];
  }

  /**
   * Что делать с тем, чей день уже прошёл. Всегда догоняет в собственном слоте —
   * ни для чего не выделяем вечер отдельно, это и путало в настройках. «Переспросить»
   * решает не «когда», а «сколько раз»: repeat — в каждой следующей сводке, пока не
   * отмечено готовым; иначе — ровно один раз (missedNotified не даёт напомнить снова).
   * Возвращает null, если догонять не нужно или момент ещё не наступил.
   */
  private planMissed(
    repeat: boolean,
    alreadyNotified: boolean,
    ctx: { ownSlot: TimeSlot; timezone: string; today: string; now: Date; slotTimes: SlotTimes },
  ): { slot: TimeSlot; at: Date } | null {
    if (!repeat && alreadyNotified) return null;
    const at = zonedDateTimeToUtc(ctx.today, timeForSlot(ctx.ownSlot, ctx.slotTimes), ctx.timezone);
    return at > ctx.now ? null : { slot: ctx.ownSlot, at };
  }

  /**
   * Атомарный захват доставки. Вставка с ON CONFLICT DO NOTHING гарантирует
   * единственную запись на ключ, условный UPDATE — единственного исполнителя.
   */
  private async claim(item: PlannedDelivery): Promise<{ id: string; attemptCount: number } | null> {
    await this.db
      .insert(reminderDeliveries)
      .values({
        userId: item.userId,
        reminderId: item.reminderId,
        taskId: item.taskId,
        scheduledFor: item.scheduledFor,
        channel: this.provider.channel,
        status: 'pending',
        idempotencyKey: item.idempotencyKey,
      })
      .onConflictDoNothing({ target: reminderDeliveries.idempotencyKey });

    const claimed = await this.db
      .update(reminderDeliveries)
      .set({
        status: 'processing',
        attemptCount: sql`${reminderDeliveries.attemptCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(reminderDeliveries.idempotencyKey, item.idempotencyKey),
          eq(reminderDeliveries.status, 'pending'),
          lt(reminderDeliveries.attemptCount, MAX_ATTEMPTS),
        ),
      )
      .returning({ id: reminderDeliveries.id, attemptCount: reminderDeliveries.attemptCount });

    return claimed[0] ?? null;
  }

  /** Диагностика: сколько доставок в каком состоянии. */
  async stats(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ status: reminderDeliveries.status, count: sql<number>`count(*)` })
      .from(reminderDeliveries)
      .groupBy(reminderDeliveries.status);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  }

  async pendingFor(reminderIds: string[]) {
    if (reminderIds.length === 0) return [];
    return this.db
      .select()
      .from(reminderDeliveries)
      .where(inArray(reminderDeliveries.reminderId, reminderIds));
  }
}
