import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { todayInTimezone, zonedDateTimeToUtc } from '@planner/shared';
import { DB, type Database } from '../../db/db.module.js';
import { reminderDeliveries, reminders, userSettings, users } from '../../db/schema.js';
import { NOTIFICATION_PROVIDER } from './notification.token.js';
import type { NotificationProvider } from './providers/notification.provider.js';

const MAX_ATTEMPTS = 3;

interface PlannedDelivery {
  reminderIds: string[];
  userId: string;
  scheduledFor: Date;
  idempotencyKey: string;
  text: string;
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

  /** Собирает список того, что уже пора отправить: отдельные алерты и дневные сводки. */
  private async plan(now: Date): Promise<PlannedDelivery[]> {
    const rows = await this.db
      .select({
        reminder: reminders,
        timezone: users.timezone,
        digestTime: userSettings.digestTime,
      })
      .from(reminders)
      .innerJoin(users, eq(users.id, reminders.userId))
      .leftJoin(userSettings, eq(userSettings.userId, reminders.userId))
      .where(eq(reminders.status, 'active'));

    const alerts: PlannedDelivery[] = [];
    const digestBuckets = new Map<string, PlannedDelivery>();

    for (const row of rows) {
      const r = row.reminder;
      const timezone = r.timezone || row.timezone || 'UTC';
      const date = String(r.scheduledDate).slice(0, 10);
      const digestTime = row.digestTime ?? '08:30';

      if (r.deliveryMode === 'alert' && r.scheduledTime) {
        const at = zonedDateTimeToUtc(date, r.scheduledTime, timezone);
        if (at <= now) {
          alerts.push({
            reminderIds: [r.id],
            userId: r.userId,
            scheduledFor: at,
            idempotencyKey: `alert:${r.id}:${date}:${r.scheduledTime}`,
            text: `Напоминание: ${r.text}`,
          });
        }
        continue;
      }

      const at = zonedDateTimeToUtc(date, digestTime, timezone);
      if (at > now) continue;
      const today = todayInTimezone(timezone, now);
      const key = `digest:${r.userId}:${today}`;
      const bucket = digestBuckets.get(key) ?? {
        reminderIds: [],
        userId: r.userId,
        scheduledFor: at,
        idempotencyKey: key,
        text: '',
      };
      bucket.reminderIds.push(r.id);
      digestBuckets.set(key, bucket);
    }

    for (const bucket of digestBuckets.values()) {
      const texts = rows
        .filter((row) => bucket.reminderIds.includes(row.reminder.id))
        .map((row) => `— ${row.reminder.text}`);
      bucket.text = `Доброе утро. Ты хотела сегодня:\n${texts.join('\n')}`;
    }

    return [...alerts, ...digestBuckets.values()];
  }

  /**
   * Атомарный захват доставки. Вставка с ON CONFLICT DO NOTHING гарантирует
   * единственную запись на ключ, условный UPDATE — единственного исполнителя.
   */
  private async claim(item: PlannedDelivery): Promise<{ id: string; attemptCount: number } | null> {
    const primary = item.reminderIds[0];
    if (!primary) return null;
    await this.db
      .insert(reminderDeliveries)
      .values({
        reminderId: primary,
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
