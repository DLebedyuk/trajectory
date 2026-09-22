import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import { DB, type Database } from '../../db/db.module.js';
import { oauthStates, sessions, userFocus, users, userSettings } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { ApiException } from '../../common/api-error.js';
import type { GoogleProfile } from './google-oauth.js';

export const SESSION_COOKIE = 'traektoria_session';

const STATE_TTL_MS = 10 * 60 * 1000;

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  timezone: string;
}

@Injectable()
export class AuthService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Одноразовый state живёт 10 минут и сгорает после первого использования. */
  async createState(
    purpose: 'login' | 'login-desktop' | 'calendar' | 'desktop-exchange',
    userId?: string,
    redirectTo?: string,
  ) {
    const state = randomBytes(24).toString('base64url');
    await this.db.insert(oauthStates).values({
      state,
      purpose,
      userId: userId ?? null,
      redirectTo: redirectTo ?? null,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });
    return state;
  }

  async consumeState(state: string, purpose: 'calendar' | 'desktop-exchange') {
    return this.consumeStateByPurposes(state, [purpose]);
  }

  /** Вход из десктопа начинается с purpose='login-desktop' — колбэк принимает оба варианта. */
  async consumeLoginState(state: string) {
    return this.consumeStateByPurposes(state, ['login', 'login-desktop']);
  }

  private async consumeStateByPurposes(state: string, purposes: string[]) {
    const [row] = await this.db
      .update(oauthStates)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(oauthStates.state, state),
          inArray(oauthStates.purpose, purposes),
          isNull(oauthStates.usedAt),
          gt(oauthStates.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!row) throw ApiException.unauthorized('Ссылка входа устарела. Попробуйте ещё раз.');
    return row;
  }

  /**
   * Второй шаг входа из десктопа: колбэк Google открывается в системном
   * браузере, а не в WebView, поэтому кука сессии, выставленная там, до
   * приложения не доходит. Вместо неё — короткоживущий одноразовый код в
   * deep-link (traektoria://auth-callback?code=...), который WebView сразу
   * меняет на настоящую сессию через POST /api/auth/desktop-exchange.
   */
  async createDesktopExchangeCode(userId: string): Promise<string> {
    return this.createState('desktop-exchange', userId);
  }

  async consumeDesktopExchangeCode(code: string): Promise<string> {
    const row = await this.consumeState(code, 'desktop-exchange');
    if (!row.userId) throw ApiException.unauthorized('Код входа повреждён. Попробуйте ещё раз.');
    return row.userId;
  }

  /**
   * Находим пользователя по Google sub, иначе по почте (человек мог быть
   * заведён сидом), иначе создаём вместе с настройками и фокусом.
   */
  async upsertGoogleUser(profile: GoogleProfile): Promise<SessionUser> {
    const [bySub] = await this.db
      .select()
      .from(users)
      .where(eq(users.googleSub, profile.sub))
      .limit(1);
    if (bySub) {
      const [updated] = await this.db
        .update(users)
        .set({
          email: profile.email,
          displayName: profile.name,
          avatarUrl: profile.picture,
          updatedAt: new Date(),
        })
        .where(eq(users.id, bySub.id))
        .returning();
      return this.toSessionUser(updated ?? bySub);
    }

    const [byEmail] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);
    if (byEmail) {
      const [linked] = await this.db
        .update(users)
        .set({
          googleSub: profile.sub,
          displayName: profile.name,
          avatarUrl: profile.picture,
          updatedAt: new Date(),
        })
        .where(eq(users.id, byEmail.id))
        .returning();
      return this.toSessionUser(linked ?? byEmail);
    }

    const [created] = await this.db
      .insert(users)
      .values({
        email: profile.email,
        displayName: profile.name,
        googleSub: profile.sub,
        avatarUrl: profile.picture,
      })
      .returning();
    const user = created as typeof users.$inferSelect;
    await this.db.insert(userSettings).values({ userId: user.id }).onConflictDoNothing();
    await this.db.insert(userFocus).values({ userId: user.id }).onConflictDoNothing();
    return this.toSessionUser(user);
  }

  private toSessionUser(u: typeof users.$inferSelect): SessionUser {
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      timezone: u.timezone,
    };
  }

  /** В куку уходит случайный токен, в базу — только его хеш. */
  async createSession(
    userId: string,
    userAgent?: string,
  ): Promise<{ token: string; ttlMs: number }> {
    const token = randomBytes(32).toString('base64url');
    const ttlMs = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
    await this.db.insert(sessions).values({
      userId,
      tokenHash: hash(token),
      userAgent: userAgent?.slice(0, 300) ?? null,
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return { token, ttlMs };
  }

  async resolveSession(token: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: sessions.id, userId: sessions.userId })
      .from(sessions)
      .where(and(eq(sessions.tokenHash, hash(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (!row) return null;
    await this.db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.id));
    return row.userId;
  }

  async destroySession(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hash(token)));
  }

  /** Чистка просроченного: вызывается при входе, отдельного воркера не нужно. */
  async purgeExpired(): Promise<void> {
    const now = new Date();
    await this.db.delete(sessions).where(lt(sessions.expiresAt, now));
    await this.db
      .delete(oauthStates)
      .where(or(lt(oauthStates.expiresAt, now), lt(oauthStates.usedAt, now)));
  }
}
