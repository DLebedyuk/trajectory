import { Body, Controller, Get, Headers, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { env } from '../../config/env.js';
import { ApiException } from '../../common/api-error.js';
import { AuthGuard, CurrentUser } from '../../common/current-user.js';
import { TelegramService } from './telegram.service.js';
import { TelegramLinkService } from './telegram-link.service.js';

/** Приём апдейтов в webhook-режиме (production). Без гварда: это ручка Telegram. */
@ApiTags('telegram')
@Controller('api/telegram')
export class TelegramController {
  constructor(
    @Inject(TelegramService) private readonly service: TelegramService,
    @Inject(TelegramLinkService) private readonly link: TelegramLinkService,
  ) {}

  /**
   * Telegram присылает секрет в заголовке. Без проверки апдейт мог бы прислать
   * кто угодно — и от имени бота создать напоминание в чужом аккаунте.
   */
  @Post('webhook')
  async webhook(
    @Body() body: unknown,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    if (!env.TELEGRAM_WEBHOOK_SECRET) {
      throw ApiException.unauthorized(
        'Вебхук не настроен: задайте TELEGRAM_WEBHOOK_SECRET, иначе ручка открыта всем.',
      );
    }
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      throw ApiException.unauthorized('Неверный секрет вебхука.');
    }
    await this.service.handleUpdate(body);
    return { ok: true };
  }
}

@ApiTags('telegram')
@UseGuards(AuthGuard)
@Controller('api/telegram')
export class TelegramLinkController {
  constructor(@Inject(TelegramLinkService) private readonly link: TelegramLinkService) {}

  @Get('status')
  status(@CurrentUser() userId: string) {
    return this.link.status(userId);
  }

  @Post('link-code')
  issue(@CurrentUser() userId: string) {
    return this.link.issueCode(userId);
  }

  @Post('disconnect')
  disconnect(@CurrentUser() userId: string) {
    return this.link.disconnect(userId);
  }
}
