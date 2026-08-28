import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { todayInTimezone, zonedDateTimeToUtc } from '@planner/shared';
import { DB, type Database } from '../../db/db.module.js';
import { reminderDeliveries, reminders, tasks, userSettings, users } from '../../db/schema.js';
import { NOTIFICATION_PROVIDER } from './notification.token.js';
import type { NotificationProvider } from './providers/notification.provider.js';
import { EVENING_TIME } from './reminders.service.js';

const MAX_ATTEMPTS = 3;

type MissedBehavior = 'none' | 'evening' | 'nextDigest';

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
   * Собирает список того, что уже пора отправить: точечные алерты, утренние
   * сводки, вечернее догоняние пропущенного и напоминания по задачам.
   */
  private async plan(now: Date): Promise<PlannedDelivery[]> {
    const alerts: PlannedDelivery[] = [];
    const digest = new Map<string, Bucket>();
    const evening = new Map<string, Bucket>();

    const bucketFor = (
      store: Map<string, Bucket>,
      kind: 'digest' | 'evening',
      userId: string,
      today: string,
      at: Date,
      line: string,
    ): void => {
      const key = `${kind}:${userId}:${today}`;
      const existing = store.get(key);
      if (existing) {
        existing.lines.push(line);
        return;
      }
      store.set(key, {
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
        digestTime: userSettings.digestTime,
        missedDefault: userSettings.missedReminderBehavior,
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
      const digestTime = row.digestTime ?? '08:30';

      if (date > today) continue;

      if (date < today) {
        const target = this.planMissed((r.missedBehavior as MissedBehavior) ?? 'evening', {
          timezone,
          today,
          now,
          digestTime,
        });
        if (target) {
          bucketFor(
            target.kind === 'digest' ? digest : evening,
            target.kind,
            r.userId,
            today,
            target.at,
            r.text,
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
          });
        }
        continue;
      }

      const at = zonedDateTimeToUtc(date, digestTime, timezone);
      if (at > now) continue;
      bucketFor(digest, 'digest', r.userId, today, at, r.text);
    }

    const taskRows = await this.db
      .select({
        id: tasks.id,
        userId: tasks.userId,
        title: tasks.title,
        remindAt: tasks.remindAt,
        timezone: users.timezone,
        digestTime: userSettings.digestTime,
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
      const digestTime = t.digestTime ?? '08:30';
      if (date > today) continue;

      const line = `${t.title} — задача`;
      if (date < today) {
        const target = this.planMissed((t.missedDefault as MissedBehavior) ?? 'evening', {
          timezone,
          today,
          now,
          digestTime,
        });
        if (target) {
          bucketFor(
            target.kind === 'digest' ? digest : evening,
            target.kind,
            t.userId,
            today,
            target.at,
            line,
          );
        }
        continue;
      }

      const at = zonedDateTimeToUtc(date, digestTime, timezone);
      if (at > now) continue;
      bucketFor(digest, 'digest', t.userId, today, at, line);
    }

    for (const bucket of digest.values()) {
      bucket.delivery.text = `Доброе утро. Ты хотела сегодня:\n${bucket.lines
        .map((l) => `— ${l}`)
        .join('\n')}`;
    }
    for (const bucket of evening.values()) {
      bucket.delivery.text = `Ты просила напомнить ещё раз:\n${bucket.lines
        .map((l) => `— ${l}`)
        .join('\n')}`;
    }

    return [
      ...alerts,
      ...[...digest.values()].map((b) => b.delivery),
      ...[...evening.values()].map((b) => b.delivery),
    ];
  }

  /**
   * Что делать с тем, чей день уже прошёл. Решение принимает пользователь
   * через missedBehavior, а не планировщик: «none» действительно значит «забыть».
   * Возвращает null, если догонять не нужно или момент ещё не наступил.
   */
  private planMissed(
    behavior: MissedBehavior,
    ctx: { timezone: string; today: string; now: Date; digestTime: string },
  ): { kind: 'digest' | 'evening'; at: Date } | null {
    if (behavior === 'none') return null;
    const kind = behavior === 'nextDigest' ? 'digest' : 'evening';
    const time = kind === 'digest' ? ctx.digestTime : EVENING_TIME;
    const at = zonedDateTimeToUtc(ctx.today, time, ctx.timezone);
    return at > ctx.now ? null : { kind, at };
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
