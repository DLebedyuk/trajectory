import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller.js';
import { RemindersService } from './reminders.service.js';
import { ReminderSchedulerService } from './reminder-scheduler.service.js';
import { ConsoleNotificationProvider } from './providers/notification.provider.js';
import { NotificationRouter } from './providers/notification.router.js';
import { NOTIFICATION_PROVIDER } from './notification.token.js';

/**
 * Модуль напоминаний: HTTP API + планировщик доставки.
 * Планировщик и бот работают в одном процессе, но разделены по модулям,
 * чтобы позже вынести worker отдельно без переписывания логики.
 */
@Module({
  controllers: [RemindersController],
  providers: [
    RemindersService,
    ReminderSchedulerService,
    ConsoleNotificationProvider,
    NotificationRouter,
    { provide: NOTIFICATION_PROVIDER, useExisting: NotificationRouter },
  ],
  exports: [RemindersService, ReminderSchedulerService, NotificationRouter, NOTIFICATION_PROVIDER],
})
export class RemindersModule {}
