import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TelegramService } from './telegram.service.js';

/** Приём апдейтов в webhook-режиме (production). */
@ApiTags('telegram')
@Controller('api/telegram')
export class TelegramController {
  constructor(@Inject(TelegramService) private readonly service: TelegramService) {}

  @Post('webhook')
  async webhook(@Body() body: unknown) {
    await this.service.handleUpdate(body);
    return { ok: true };
  }
}
