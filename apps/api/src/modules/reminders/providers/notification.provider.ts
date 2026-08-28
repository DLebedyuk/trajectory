import { Injectable, Logger } from '@nestjs/common';

export interface OutgoingNotification {
  userId: string;
  text: string;
  /** Кнопки быстрых действий, если канал их поддерживает. */
  actions?: { label: string; data: string }[];
}

export interface NotificationProvider {
  readonly channel: string;
  /** true, если провайдер реально может доставить сообщение этому пользователю. */
  canDeliver(userId: string): Promise<boolean>;
  send(notification: OutgoingNotification): Promise<void>;
}

/**
 * MOCK-канал. Используется, когда TELEGRAM_BOT_TOKEN не задан:
 * сообщение пишется в лог и доставка считается обработанной.
 */
@Injectable()
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly channel = 'console';
  private readonly logger = new Logger('ConsoleNotifications');

  async canDeliver(): Promise<boolean> {
    return true;
  }

  async send(notification: OutgoingNotification): Promise<void> {
    this.logger.log(
      `[MOCK-ДОСТАВКА] пользователь ${notification.userId}: ${notification.text}` +
        (notification.actions?.length
          ? ` | кнопки: ${notification.actions.map((a) => a.label).join(', ')}`
          : ''),
    );
  }
}
