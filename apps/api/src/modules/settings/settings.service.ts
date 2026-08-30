import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Settings, UpdateSettingsInput, User } from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import { telegramAccounts, userSettings, users } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { isoRequired } from '../../common/mappers.js';

@Injectable()
export class SettingsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async me(userId: string): Promise<User> {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!row) throw ApiException.notFound('Пользователь');
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      timezone: row.timezone,
      locale: row.locale,
      createdAt: isoRequired(row.createdAt),
      updatedAt: isoRequired(row.updatedAt),
    };
  }

  async get(userId: string): Promise<Settings> {
    const user = await this.me(userId);
    let [row] = await this.db.select().from(userSettings).where(eq(userSettings.userId, userId));
    if (!row) [row] = await this.db.insert(userSettings).values({ userId }).returning();
    const [tg] = await this.db
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.userId, userId));
    const s = row as typeof userSettings.$inferSelect;
    return {
      userId,
      timezone: user.timezone,
      locale: user.locale,
      digestTime: s.digestTime,
      missedReminderBehavior: s.missedReminderBehavior as Settings['missedReminderBehavior'],
      theme: s.theme as Settings['theme'],
      hardNotifications: s.hardNotifications,
      softNotifications: s.softNotifications,
      telegramLinked: Boolean(tg),
      updatedAt: isoRequired(s.updatedAt),
    };
  }

  async update(userId: string, input: UpdateSettingsInput): Promise<Settings> {
    await this.get(userId);
    if (input.timezone !== undefined || input.locale !== undefined) {
      await this.db
        .update(users)
        .set({
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.locale !== undefined ? { locale: input.locale } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }
    await this.db
      .update(userSettings)
      .set({
        ...(input.digestTime !== undefined ? { digestTime: input.digestTime } : {}),
        ...(input.missedReminderBehavior !== undefined
          ? { missedReminderBehavior: input.missedReminderBehavior }
          : {}),
        ...(input.theme !== undefined ? { theme: input.theme } : {}),
        ...(input.hardNotifications !== undefined
          ? { hardNotifications: input.hardNotifications }
          : {}),
        ...(input.softNotifications !== undefined
          ? { softNotifications: input.softNotifications }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, userId));
    return this.get(userId);
  }
}
