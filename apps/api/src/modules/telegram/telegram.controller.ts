import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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

  @Post('webhook')
  async webhook(@Body() body: unknown) {
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
