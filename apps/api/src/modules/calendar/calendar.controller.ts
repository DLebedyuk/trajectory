import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { env, isGoogleAuthConfigured } from '../../config/env.js';
import { ApiException } from '../../common/api-error.js';
import { isEncryptionConfigured } from '../../common/crypto.js';
import { safeRedirect } from '../../common/safe-redirect.js';
import { AuthGuard, CurrentUser } from '../../common/current-user.js';
import { AuthService } from '../auth/auth.service.js';
import { CALENDAR_SCOPES, GOOGLE_OAUTH, type GoogleOAuthClient } from '../auth/google-oauth.js';
import { CalendarService } from './calendar.service.js';

@ApiTags('calendar')
@UseGuards(AuthGuard)
@Controller('api/calendar')
export class CalendarController {
  constructor(
    @Inject(CalendarService) private readonly service: CalendarService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GOOGLE_OAUTH) private readonly google: GoogleOAuthClient,
  ) {}

  @Get('connection')
  connection(@CurrentUser() userId: string) {
    return this.service.connection(userId);
  }

  @Get('list')
  list(@CurrentUser() userId: string) {
    return this.service.listCalendars(userId);
  }

  @Post(':id/enabled')
  setEnabled(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: { enabled?: boolean },
  ) {
    return this.service.setEnabled(userId, id, Boolean(body?.enabled));
  }

  @Post('sync')
  sync(@CurrentUser() userId: string) {
    return this.service.sync(userId);
  }

  @Post('disconnect')
  disconnect(@CurrentUser() userId: string) {
    return this.service.disconnect(userId);
  }

  /**
   * Второе согласие — только на календарь. Вход в аккаунт его не выдаёт:
   * доступ к данным человек разрешает отдельно и осознанно.
   */
  @Get('google/connect')
  async connect(@CurrentUser() userId: string, @Res() res: Response) {
    if (!isGoogleAuthConfigured) {
      throw ApiException.validation('Google не настроен: нет GOOGLE_CLIENT_ID/SECRET.');
    }
    if (!isEncryptionConfigured()) {
      throw ApiException.validation(
        'Не задан TOKEN_ENCRYPTION_KEY: refresh-токен Google негде хранить в зашифрованном виде.',
      );
    }
    const state = await this.auth.createState('calendar', userId, `${env.APP_BASE_URL}/settings`);
    res.redirect(
      this.google.authorizeUrl({
        state,
        scopes: CALENDAR_SCOPES,
        redirectUri: env.GOOGLE_CALENDAR_REDIRECT_URI,
        // refresh-токен Google отдаёт только при offline и явном согласии
        offline: true,
      }),
    );
  }
}

/** Возврат от Google. Без гварда: пользователь приходит по ссылке из Google. */
@ApiTags('calendar')
@Controller('api/calendar')
export class CalendarCallbackController {
  private readonly logger = new Logger('Calendar');

  constructor(
    @Inject(CalendarService) private readonly service: CalendarService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GOOGLE_OAUTH) private readonly google: GoogleOAuthClient,
  ) {}

  @Get('google/callback')
  async callback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    if (error || !code || !state) {
      res.redirect(`${env.APP_BASE_URL}/settings?calendar=denied`);
      return;
    }
    const stateRow = await this.auth.consumeState(state, 'calendar');
    if (!stateRow.userId) throw ApiException.unauthorized('Непонятно, чей это календарь.');

    const tokens = await this.google.exchangeCode(code, env.GOOGLE_CALENDAR_REDIRECT_URI);
    await this.service.saveCredentials(stateRow.userId, {
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });

    try {
      await this.service.sync(stateRow.userId);
    } catch (e) {
      // подключение состоялось: согласие получено и токены сохранены. Причина
      // неудачной первой синхронизации уже записана в lastError и видна в
      // настройках, но в логе она нужнее — там есть ответ Google целиком.
      this.logger.warn(
        `Первая синхронизация после подключения не удалась: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    res.redirect(safeRedirect(stateRow.redirectTo, '/settings?calendar=connected'));
  }
}
