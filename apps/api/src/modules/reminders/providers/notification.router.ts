import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationProvider, OutgoingNotification } from './notification.provider.js';
import { ConsoleNotificationProvider } from './notification.provider.js';

/**
 * Выбирает канал доставки. Telegram регистрирует себя при старте, если задан
 * токен; иначе остаётся mock-канал console. Такой роутер снимает циклическую
 * зависимость между модулями напоминаний и Telegram.
 */
@Injectable()
export class NotificationRouter implements NotificationProvider {
  private readonly logger = new Logger('NotificationRouter');
  private delegate: NotificationProvider;

  constructor(
    @Inject(ConsoleNotificationProvider) private readonly fallback: ConsoleNotificationProvider,
  ) {
    this.delegate = fallback;
  }

  register(provider: NotificationProvider): void {
    this.delegate = provider;
    this.logger.log(`Канал доставки напоминаний: ${provider.channel}`);
  }

  get channel(): string {
    return this.delegate.channel;
  }

  async canDeliver(userId: string): Promise<boolean> {
    return this.delegate.canDeliver(userId);
  }

  async send(notification: OutgoingNotification): Promise<void> {
    if (await this.delegate.canDeliver(notification.userId)) {
      await this.delegate.send(notification);
      return;
    }
    // пользователь не связан с каналом — не теряем сообщение, пишем в mock-лог
    await this.fallback.send(notification);
  }
}
