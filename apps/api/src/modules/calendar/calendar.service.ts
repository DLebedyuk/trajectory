import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gte, inArray, lte, notInArray } from 'drizzle-orm';
import { addDaysToDateOnly, todayInTimezone } from '@planner/shared';
import { DB, type Database } from '../../db/db.module.js';
import { calendarEvents, calendars, googleCredentials, users } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
  MissingEncryptionKeyError,
} from '../../common/crypto.js';
import {
  GOOGLE_CALENDAR_API,
  GoogleAccessRevokedError,
  GoogleApiError,
  type GoogleCalendarApi,
} from './google-calendar.api.js';

/** Окно синхронизации: неделя назад — месяц вперёд. Дальше событий не показываем. */
const SYNC_DAYS_BACK = 7;
const SYNC_DAYS_FORWARD = 30;

export interface CalendarConnection {
  connected: boolean;
  /** Доступ отозван на стороне Google — нужно подключить заново. */
  revoked: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  encryptionReady: boolean;
}

/**
 * Итог синхронизации. partial честно говорит, что часть данных не доехала:
 * раньше такой прогон засчитывался как полностью успешный, и пользователь
 * видел «синхронизировано» поверх неполного календаря.
 */
export interface SyncResult {
  calendars: number;
  events: number;
  removed: number;
  partial: boolean;
  failed: string[];
}

export interface CalendarView {
  id: string;
  name: string;
  enabled: boolean;
  primary: boolean;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger('Calendar');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(GOOGLE_CALENDAR_API) private readonly api: GoogleCalendarApi,
  ) {}

  async connection(userId: string): Promise<CalendarConnection> {
    const [row] = await this.db
      .select()
      .from(googleCredentials)
      .where(eq(googleCredentials.userId, userId));
    return {
      connected: Boolean(row) && !row?.revokedAt,
      revoked: Boolean(row?.revokedAt),
      lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      lastError: row?.lastError ?? null,
      encryptionReady: isEncryptionConfigured(),
    };
  }

  /** Сохранение доступа после согласия пользователя. */
  async saveCredentials(
    userId: string,
    tokens: { refreshToken: string | null; accessToken: string; expiresAt: Date; scope: string },
  ): Promise<void> {
    if (!isEncryptionConfigured()) throw new MissingEncryptionKeyError();

    // Google отдаёт refresh-токен только при первом согласии. При повторном
    // подключении без него мы обязаны сохранить прежний, иначе доступ протухнет.
    let refreshToken = tokens.refreshToken;
    if (!refreshToken) {
      const [existing] = await this.db
        .select()
        .from(googleCredentials)
        .where(eq(googleCredentials.userId, userId));
      if (!existing) {
        throw ApiException.validation(
          'Google не выдал refresh-токен. Отзовите доступ приложению в аккаунте Google и подключите календарь заново.',
        );
      }
      refreshToken = decryptSecret(existing.refreshTokenEnc);
    }

    const values = {
      userId,
      refreshTokenEnc: encryptSecret(refreshToken),
      accessTokenEnc: encryptSecret(tokens.accessToken),
      accessTokenExpiresAt: tokens.expiresAt,
      scope: tokens.scope,
      revokedAt: null,
      lastError: null,
    };
    await this.db
      .insert(googleCredentials)
      .values(values)
      .onConflictDoUpdate({ target: googleCredentials.userId, set: values });
  }

  async disconnect(userId: string): Promise<{ ok: true }> {
    const [row] = await this.db
      .select()
      .from(googleCredentials)
      .where(eq(googleCredentials.userId, userId));
    if (row) {
      try {
        await this.api.revoke(decryptSecret(row.refreshTokenEnc));
      } catch {
        // отзыв на стороне Google — «постараться»: локально доступ всё равно убираем
      }
    }
    await this.db.delete(googleCredentials).where(eq(googleCredentials.userId, userId));
    // события удаляем: показывать чужой кеш после отключения нечестно
    const own = await this.db
      .select({ id: calendars.id })
      .from(calendars)
      .where(and(eq(calendars.userId, userId), eq(calendars.provider, 'google')));
    const ids = own.map((c) => c.id);
    if (ids.length > 0) {
      await this.db.delete(calendarEvents).where(inArray(calendarEvents.calendarId, ids));
      await this.db.delete(calendars).where(inArray(calendars.id, ids));
    }
    return { ok: true };
  }

  async listCalendars(userId: string): Promise<CalendarView[]> {
    const rows = await this.db
      .select()
      .from(calendars)
      .where(eq(calendars.userId, userId))
      .orderBy(calendars.name);
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      enabled: c.enabled,
      primary: false,
    }));
  }

  async setEnabled(userId: string, calendarId: string, enabled: boolean): Promise<CalendarView> {
    const [row] = await this.db
      .update(calendars)
      .set({ enabled })
      .where(and(eq(calendars.userId, userId), eq(calendars.id, calendarId)))
      .returning();
    if (!row) throw ApiException.notFound('Календарь');
    return { id: row.id, name: row.name, enabled: row.enabled, primary: false };
  }

  /** Действующий access-токен: обновляем, только когда старый кончился. */
  private async accessToken(userId: string): Promise<string> {
    const [row] = await this.db
      .select()
      .from(googleCredentials)
      .where(eq(googleCredentials.userId, userId));
    if (!row) throw ApiException.validation('Google Calendar не подключён.');
    if (row.revokedAt) {
      throw ApiException.validation(
        'Доступ к Google Calendar отозван. Подключите календарь заново.',
      );
    }

    const stillValid =
      row.accessTokenEnc &&
      row.accessTokenExpiresAt &&
      row.accessTokenExpiresAt.getTime() - 60_000 > Date.now();
    if (stillValid) return decryptSecret(row.accessTokenEnc as string);

    try {
      const fresh = await this.api.refreshAccessToken(decryptSecret(row.refreshTokenEnc));
      await this.db
        .update(googleCredentials)
        .set({
          accessTokenEnc: encryptSecret(fresh.accessToken),
          accessTokenExpiresAt: fresh.expiresAt,
          lastError: null,
        })
        .where(eq(googleCredentials.userId, userId));
      return fresh.accessToken;
    } catch (e) {
      return await this.failFromGoogle(userId, e);
    }
  }

  private async markRevoked(userId: string, message: string): Promise<void> {
    await this.db
      .update(googleCredentials)
      .set({ revokedAt: new Date(), lastError: message })
      .where(eq(googleCredentials.userId, userId));
  }

  /** Отказ Google, который не связан с согласием: запоминаем, доступ не трогаем. */
  private async markError(userId: string, message: string): Promise<void> {
    await this.db
      .update(googleCredentials)
      .set({ lastError: message })
      .where(eq(googleCredentials.userId, userId));
  }

  /**
   * Единая реакция на отказ Google. Отзыв гасит подключение и требует нового
   * согласия; всё остальное только записывается — гасить доступ из-за квоты
   * или выключенного в проекте API нельзя, переподключение это не чинит.
   */
  private async failFromGoogle(userId: string, e: unknown): Promise<never> {
    if (e instanceof GoogleAccessRevokedError) {
      await this.markRevoked(userId, e.message);
      throw ApiException.validation(
        `Доступ к Google Calendar отозван (${e.message}). Подключите календарь заново.`,
      );
    }
    if (e instanceof GoogleApiError) {
      await this.markError(userId, e.message);
      throw ApiException.validation(`Google Calendar не ответил: ${e.message}`);
    }
    throw e;
  }

  /**
   * Синхронизация. Календари и события сопоставляются по id провайдера, поэтому
   * повторный запуск обновляет записи, а не плодит их.
   */
  async sync(userId: string): Promise<SyncResult> {
    const token = await this.accessToken(userId);
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    const timezone = user?.timezone ?? 'UTC';

    let remoteCalendars;
    try {
      remoteCalendars = await this.api.listCalendars(token);
    } catch (e) {
      return await this.failFromGoogle(userId, e);
    }

    for (const rc of remoteCalendars) {
      await this.db
        .insert(calendars)
        .values({
          userId,
          name: rc.name,
          provider: 'google',
          externalId: rc.externalId,
          // новый календарь включаем только если он основной: остальное пусть выбирает человек
          enabled: rc.primary,
        })
        .onConflictDoUpdate({
          target: [calendars.userId, calendars.externalId],
          // enabled намеренно не трогаем: выбор пользователя важнее данных провайдера
          set: { name: rc.name },
        });
    }

    // Календари, исчезнувшие у провайдера, убираем вместе с их событиями:
    // список от Google полный (пагинация пройдена), значит их там больше нет,
    // а показывать вечный кеш удалённого календаря нечестно.
    const alive = new Set(remoteCalendars.map((c) => c.externalId));
    const alreadyStored = await this.db
      .select()
      .from(calendars)
      .where(and(eq(calendars.userId, userId), eq(calendars.provider, 'google')));
    const gone = alreadyStored.filter((c) => c.externalId && !alive.has(c.externalId));
    if (gone.length > 0) {
      const goneIds = gone.map((c) => c.id);
      await this.db.delete(calendarEvents).where(inArray(calendarEvents.calendarId, goneIds));
      await this.db.delete(calendars).where(inArray(calendars.id, goneIds));
      this.logger.log(`Убрано календарей, исчезнувших у Google: ${gone.length}`);
    }

    const stored = await this.db
      .select()
      .from(calendars)
      .where(and(eq(calendars.userId, userId), eq(calendars.provider, 'google')));
    const enabled = stored.filter((c) => c.enabled && c.externalId);

    const today = todayInTimezone(timezone);
    const fromDate = addDaysToDateOnly(today, -SYNC_DAYS_BACK);
    const toDate = addDaysToDateOnly(today, SYNC_DAYS_FORWARD);
    const range = {
      from: new Date(`${fromDate}T00:00:00.000Z`),
      to: new Date(`${toDate}T23:59:59.000Z`),
    };

    let eventCount = 0;
    let removedCount = 0;
    const failed: string[] = [];
    // один сломавшийся календарь не должен ронять синхронизацию остальных,
    // но и молчать о нём нельзя — текст доедет до настроек
    let softError: string | null = null;
    for (const cal of enabled) {
      let remoteEvents;
      try {
        remoteEvents = await this.api.listEvents(token, cal.externalId as string, range, timezone);
      } catch (e) {
        if (e instanceof GoogleAccessRevokedError) {
          return await this.failFromGoogle(userId, e);
        }
        const message = e instanceof Error ? e.message : String(e);
        softError = `Календарь «${cal.name}» не синхронизирован: ${message}`;
        failed.push(cal.name);
        this.logger.warn(softError);
        continue;
      }

      for (const ev of remoteEvents) {
        const values = {
          userId,
          calendarId: cal.id,
          externalId: ev.externalId,
          title: ev.title,
          date: ev.date,
          time: ev.time,
          duration: ev.duration,
          allDay: ev.allDay,
          updatedAt: new Date(),
        };
        await this.db
          .insert(calendarEvents)
          .values(values)
          .onConflictDoUpdate({
            target: [calendarEvents.calendarId, calendarEvents.externalId],
            set: values,
          });
        eventCount += 1;
      }

      // Событие, удалённое в Google, должно исчезнуть и у нас. Чистим только
      // окно синхронизации и только после полной загрузки этого календаря:
      // на оборвавшейся странице «недостающее» означало бы не «удалено».
      const seen = remoteEvents.map((e) => e.externalId);
      const stale = await this.db
        .delete(calendarEvents)
        .where(
          and(
            eq(calendarEvents.calendarId, cal.id),
            gte(calendarEvents.date, fromDate),
            lte(calendarEvents.date, toDate),
            seen.length > 0 ? notInArray(calendarEvents.externalId, seen) : undefined,
          ),
        )
        .returning({ id: calendarEvents.id });
      removedCount += stale.length;
    }

    await this.db
      .update(googleCredentials)
      .set({ lastSyncAt: new Date(), lastError: softError })
      .where(eq(googleCredentials.userId, userId));

    return {
      calendars: remoteCalendars.length,
      events: eventCount,
      removed: removedCount,
      partial: failed.length > 0,
      failed,
    };
  }
}
