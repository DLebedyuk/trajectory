import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service.js';
import { TelegramController, TelegramLinkController } from './telegram.controller.js';
import { TelegramLinkService } from './telegram-link.service.js';
import { RemindersModule } from '../reminders/reminders.module.js';
import { InboxModule } from '../inbox/inbox.module.js';

@Module({
  imports: [RemindersModule, InboxModule],
  controllers: [TelegramController, TelegramLinkController],
  providers: [TelegramService, TelegramLinkService],
  exports: [TelegramService, TelegramLinkService],
})
export class TelegramModule {}
