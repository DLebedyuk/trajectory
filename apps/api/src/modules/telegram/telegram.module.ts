import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service.js';
import { TelegramController } from './telegram.controller.js';
import { RemindersModule } from '../reminders/reminders.module.js';
import { InboxModule } from '../inbox/inbox.module.js';

@Module({
  imports: [RemindersModule, InboxModule],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
