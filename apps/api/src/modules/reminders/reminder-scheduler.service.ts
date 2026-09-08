import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { todayInTimezone, zonedDateTimeToUtc } from '@planner/shared';
import type { TimeSlot } from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import { reminderDeliveries, reminders, tasks, userSettings, users } from '../../db/schema.js';
import { NOTIFICATION_PROVIDER } from './notification.token.js';
import type { NotificationProvider } from './providers/notification.provider.js';
import { SLOT_ORDER, timeForSlot, type SlotTimes } from './reminders.service.js';

const MAX_ATTEMPTS = 3;

type MissedBehavior = 'none' | 'evening' | 'nextDigest';

/** Текст-заголовок бакета — одинаковый для «настоящих» и «догоняющих» напоминаний слота. */
const SLOT_HEADER: Record<TimeSlot, string> = {
  morning: 'Доброе утро. Вы хотели сегодня:',
  day: 'Днём Вы хотели:',
  evening: 'Вечером Вы хотели:',
};

interface PlannedDelivery {
  userId: string;
  /** Доставка относится либо к напоминанию, либо к задаче, либо ни к чему (сводка). */
  reminderId: string | null;
  taskId: string | null;
  scheduledFor: Date;
  idempotencyKey: string;
  text: string;
}

interface Bucket {
  delivery: PlannedDelivery;
  lines: string[];
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
    ): void => {
      const key = `${slot}:${userId}:${today}`;
      const existing = buckets[slot].get(key);
      if (existing) {
        existing.lines.push(line);
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
        },
        lines: [line],
      });
    };

    const reminderRows = await this.db
      .select({
        reminder: reminders,
        timezone: users.timezone,
        morningTime: userSettings.morningTime,
        dayTime: userSettings.dayTime,
        eveningTime: userSettings.eveningTime,
      })
      .from(reminders)
      .innerJoin(users, eq(users.id, reminders.userId))
      .leftJoin(userSettings, eq(userSettings.userId, reminders.userId))
      .where(eq(reminders.status, 'active'));

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
        const target = this.planMissed((r.missedBehavior as MissedBehavior) ?? 'evening', {
          ownSlot: (r.timeSlot as TimeSlot | null) ?? 'morning',
          timezone,
          today,
          now,
          slotTimes,
        });
        if (target) bucketFor(target.slot, r.userId, today, target.at, r.text);
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
        timezone: users.timezone,
        morningTime: userSettings.morningTime,
        missedDefault: userSettings.missedReminderBehavior,
      })
      .from(tasks)
      .innerJoin(users, eq(users.id, tasks.userId))
      .leftJoin(userSettings, eq(userSettings.userId, tasks.userId))
      .where(and(eq(tasks.status, 'open'), isNotNull(tasks.remindAt)));

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
        const target = this.planMissed((t.missedDefault as MissedBehavior) ?? 'evening', {
          ownSlot: 'morning',
          timezone,
          today,
          now,
          slotTimes,
        });
        if (target) bucketFor(target.slot, t.userId, today, target.at, line);
        continue;
      }

      const at = zonedDateTimeToUtc(date, slotTimes.morningTime, timezone);
      if (at > now) continue;
      bucketFor('morning', t.userId, today, at, line);
    }

    for (const slot of SLOT_ORDER) {
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
   * Что делать с тем, чей день уже прошёл. Решение принимает пользователь
   * через missedBehavior, а не планировщик: «none» действительно значит «забыть».
   * «nextDigest» возвращает в тот же слот, где и было; «evening» — всегда в вечер.
   * Возвращает null, если догонять не нужно или момент ещё не наступил.
   */
  private planMissed(
    behavior: MissedBehavior,
    ctx: { ownSlot: TimeSlot; timezone: string; today: string; now: Date; slotTimes: SlotTimes },
  ): { slot: TimeSlot; at: Date } | null {
    if (behavior === 'none') return null;
    const slot = behavior === 'nextDigest' ? ctx.ownSlot : 'evening';
    const at = zonedDateTimeToUtc(ctx.today, timeForSlot(slot, ctx.slotTimes), ctx.timezone);
    return at > ctx.now ? null : { slot, at };
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
