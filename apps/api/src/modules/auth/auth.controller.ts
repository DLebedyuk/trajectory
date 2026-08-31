import { Controller, Get, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { env, isDevAuthEnabled, isGoogleAuthConfigured } from '../../config/env.js';
import { ApiException } from '../../common/api-error.js';
import { safeRedirect } from '../../common/safe-redirect.js';
import { AuthService, SESSION_COOKIE } from './auth.service.js';
import { GOOGLE_OAUTH, LOGIN_SCOPES, type GoogleOAuthClient } from './google-oauth.js';

/** Кука сессии: недоступна из JS, не уходит на чужие сайты, в проде — только по HTTPS. */
function sessionCookie(token: string, maxAgeMs: number): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function clearedCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function readSessionToken(req: Request): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=') || null;
  }
  return null;
}

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GOOGLE_OAUTH) private readonly google: GoogleOAuthClient,
  ) {}

  /** Состояние входа — единственная ручка, доступная без сессии. */
  @Get('status')
  async status(@Req() req: Request) {
    const token = readSessionToken(req);
    const userId = token ? await this.auth.resolveSession(token) : null;
    return {
      authenticated: Boolean(userId) || isDevAuthEnabled,
      googleConfigured: isGoogleAuthConfigured,
      devAuth: isDevAuthEnabled,
    };
  }

  @Get('google')
  async start(@Res() res: Response, @Query('redirectTo') redirectTo?: string) {
    if (!isGoogleAuthConfigured) {
      throw ApiException.validation(
        'Вход через Google не настроен: не заданы GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.',
      );
    }
    // проверяем на входе, чтобы в базу не попал чужой адрес
    const state = await this.auth.createState('login', undefined, safeRedirect(redirectTo));
    res.redirect(
      this.google.authorizeUrl({
        state,
        scopes: LOGIN_SCOPES,
        redirectUri: env.GOOGLE_AUTH_REDIRECT_URI,
      }),
    );
  }

  @Get('google/callback')
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    if (error || !code || !state) {
      res.redirect(`${env.APP_BASE_URL}/?auth=denied`);
      return;
    }
    const stateRow = await this.auth.consumeState(state, 'login');
    const tokens = await this.google.exchangeCode(code, env.GOOGLE_AUTH_REDIRECT_URI);
    if (!tokens.idToken) throw ApiException.unauthorized('Google не вернул ID-токен');

    const profile = this.google.profileFromIdToken(tokens.idToken);
    const user = await this.auth.upsertGoogleUser(profile);
    const { token, ttlMs } = await this.auth.createSession(user.id, req.headers['user-agent']);
    await this.auth.purgeExpired();

    res.setHeader('Set-Cookie', sessionCookie(token, ttlMs));
    // и на выходе тоже: строка в базе могла появиться до этой проверки
    res.redirect(safeRedirect(stateRow.redirectTo));
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const token = readSessionToken(req);
    if (token) await this.auth.destroySession(token);
    res.setHeader('Set-Cookie', clearedCookie());
    res.status(200).json({ ok: true });
  }
}
