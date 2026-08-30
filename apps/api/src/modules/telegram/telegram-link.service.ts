import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { DB, type Database } from '../../db/db.module.js';
import { telegramAccounts, telegramLinkCodes } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { ApiException } from '../../common/api-error.js';

const CODE_TTL_MS = 15 * 60 * 1000;
/** Без похожих символов: код читают с экрана и набирают руками. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface TelegramStatus {
  connected: boolean;
  username: string | null;
  connectedAt: string | null;
  botUsername: string | null;
}

export interface LinkCode {
  code: string;
  expiresAt: string;
  /** Готовая ссылка «открыть бота и отправить код». Пусто, если имя бота не задано. */
  deepLink: string | null;
}

@Injectable()
export class TelegramLinkService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async status(userId: string): Promise<TelegramStatus> {
    const [row] = await this.db
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.userId, userId))
      .limit(1);
    return {
      connected: Boolean(row),
      username: row?.telegramUsername ?? null,
      connectedAt: row ? row.createdAt.toISOString() : null,
      botUsername: env.TELEGRAM_BOT_USERNAME || null,
    };
  }

  /**
   * Новый код гасит предыдущие неиспользованные: иначе у пользователя на руках
   * оказывалось бы несколько действующих кодов сразу.
   */
  async issueCode(userId: string): Promise<LinkCode> {
    const now = new Date();
    await this.db
      .update(telegramLinkCodes)
      .set({ usedAt: now })
      .where(and(eq(telegramLinkCodes.userId, userId), isNull(telegramLinkCodes.usedAt)));

    const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
    await this.db.insert(telegramLinkCodes).values({ userId, code, expiresAt });

    return {
      code,
      expiresAt: expiresAt.toISOString(),
      deepLink: env.TELEGRAM_BOT_USERNAME
        ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${code}`
        : null,
    };
  }

  /**
   * Погашение кода из бота. Код одноразовый и ограничен по времени; условие
   * «не использован и не просрочен» стоит прямо в UPDATE, поэтому две
   * одновременные попытки не пройдут обе.
   */
  async redeemCode(
    rawCode: string,
    telegram: { telegramUserId: string; chatId: string; username?: string | null },
  ): Promise<{ userId: string }> {
    const code = rawCode.trim().toUpperCase();
    const [row] = await this.db
      .update(telegramLinkCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(telegramLinkCodes.code, code),
          isNull(telegramLinkCodes.usedAt),
          gt(telegramLinkCodes.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!row) {
      throw ApiException.validation('Код не подходит: он уже использован или устарел.');
    }

    // один аккаунт Telegram привязан к одному пользователю: повторная привязка перезаписывает
    await this.db
      .insert(telegramAccounts)
      .values({
        telegramUserId: telegram.telegramUserId,
        userId: row.userId,
        chatId: telegram.chatId,
        telegramUsername: telegram.username ?? null,
      })
      .onConflictDoUpdate({
        target: telegramAccounts.telegramUserId,
        set: {
          userId: row.userId,
          chatId: telegram.chatId,
          telegramUsername: telegram.username ?? null,
        },
      });

    await this.purgeExpired();
    return { userId: row.userId };
  }

  async disconnect(userId: string): Promise<{ ok: true }> {
    await this.db.delete(telegramAccounts).where(eq(telegramAccounts.userId, userId));
    await this.db
      .update(telegramLinkCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(telegramLinkCodes.userId, userId), isNull(telegramLinkCodes.usedAt)));
    return { ok: true };
  }

  private async purgeExpired(): Promise<void> {
    await this.db.delete(telegramLinkCodes).where(lt(telegramLinkCodes.expiresAt, new Date()));
  }
}
