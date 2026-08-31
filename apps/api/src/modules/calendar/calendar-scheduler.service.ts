import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isNull } from 'drizzle-orm';
import { DB, type Database } from '../../db/db.module.js';
import { googleCredentials } from '../../db/schema.js';
import { isEncryptionConfigured } from '../../common/crypto.js';
import { CalendarService } from './calendar.service.js';

/**
 * Фоновая синхронизация календаря.
 *
 * Раз в 30 минут — сознательно выбранный безопасный интервал. Квота Google на
 * чтение календаря измеряется тысячами запросов в сутки, а один прогон стоит
 * примерно (1 + число включённых календарей) запросов: при десяти
 * пользователях это единицы процентов квоты. Чаще нет смысла — события в
 * календаре не меняются посекундно, а окно синхронизации всё равно
 * пересчитывается целиком.
 *
 * Отозванные подключения пропускаем: дёргать Google отозванным токеном
 * бесполезно и только приближает лимиты.
 */
@Injectable()
export class CalendarSchedulerService {
  private readonly logger = new Logger('CalendarSync');
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CalendarService) private readonly calendar: CalendarService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncAll(): Promise<void> {
    if (!isEncryptionConfigured()) return;
    // прогон длиннее интервала не должен накладываться сам на себя
    if (this.running) {
      this.logger.warn('Предыдущая фоновая синхронизация ещё идёт — пропускаю круг.');
      return;
    }
    this.running = true;
    try {
      const rows = await this.db
        .select({ userId: googleCredentials.userId })
        .from(googleCredentials)
        .where(isNull(googleCredentials.revokedAt));

      for (const row of rows) {
        try {
          const result = await this.calendar.sync(row.userId);
          if (result.partial) {
            this.logger.warn(
              `Фоновая синхронизация прошла частично: не догрузились ${result.failed.join(', ')}`,
            );
          }
        } catch (e) {
          // причина уже записана в lastError и видна в настройках
          this.logger.warn(
            `Фоновая синхронизация не удалась: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
