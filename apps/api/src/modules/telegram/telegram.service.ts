import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';
import { eq } from 'drizzle-orm';
import { parseRelativePhrase, formatLongDate, todayInTimezone } from '@planner/shared';
import { DB, type Database } from '../../db/db.module.js';
import { telegramAccounts, users } from '../../db/schema.js';
import { env } from '../../config/env.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { InboxService } from '../inbox/inbox.service.js';
import { NotificationRouter } from '../reminders/providers/notification.router.js';
import type {
  NotificationProvider,
  OutgoingNotification,
} from '../reminders/providers/notification.provider.js';

interface PendingPhrase {
  text: string;
  time: string | null;
}

/**
 * Telegram-бот на grammY. Разбор фраз детерминированный (@planner/shared),
 * внешний ИИ не подключается. Бот пользуется теми же application services,
 * что и HTTP API.
 */
@Injectable()
export class TelegramService implements NotificationProvider, OnModuleInit, OnModuleDestroy {
  readonly channel = 'telegram';
  private readonly logger = new Logger('Telegram');
  private bot: Bot | null = null;
  /** Незавершённые диалоги «когда напомнить?» — по chatId. */
  private readonly pending = new Map<string, PendingPhrase>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(RemindersService) private readonly reminders: RemindersService,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(NotificationRouter) private readonly router: NotificationRouter,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_MODE === 'off') {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN не задан — бот не запущен, напоминания уходят в mock-канал console.',
      );
      return;
    }
    this.bot = new Bot(env.TELEGRAM_BOT_TOKEN);
    this.registerHandlers(this.bot);
    this.router.register(this);

    if (env.TELEGRAM_MODE === 'webhook') {
      if (!env.TELEGRAM_WEBHOOK_URL) {
        this.logger.error('TELEGRAM_MODE=webhook, но TELEGRAM_WEBHOOK_URL пуст');
        return;
      }
      await this.bot.api.setWebhook(env.TELEGRAM_WEBHOOK_URL);
      this.logger.log(`Webhook установлен: ${env.TELEGRAM_WEBHOOK_URL}`);
      return;
    }
    void this.bot.start({ onStart: () => this.logger.log('Бот запущен в режиме long polling') });
  }

  async onModuleDestroy(): Promise<void> {
    await this.bot?.stop();
  }

  /** Для webhook-режима: приём апдейта из HTTP-контроллера. */
  async handleUpdate(update: unknown): Promise<void> {
    await this.bot?.handleUpdate(update as never);
  }

  async canDeliver(userId: string): Promise<boolean> {
    if (!this.bot) return false;
    const [row] = await this.db
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.userId, userId));
    return Boolean(row);
  }

  async send(notification: OutgoingNotification): Promise<void> {
    if (!this.bot) throw new Error('Бот не запущен');
    const [row] = await this.db
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.userId, notification.userId));
    if (!row) throw new Error('Пользователь не связан с Telegram');
    const keyboard = new InlineKeyboard();
    (notification.actions ?? []).forEach((a) => keyboard.text(a.label, a.data));
    await this.bot.api.sendMessage(row.chatId, notification.text, {
      ...(notification.actions?.length ? { reply_markup: keyboard } : {}),
    });
  }

  private async resolveUser(telegramUserId: string, chatId: string): Promise<string | null> {
    const [existing] = await this.db
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.telegramUserId, telegramUserId));
    if (existing) return existing.userId;

    // DEVELOPMENT: первый написавший связывается с seed-пользователем.
    if (env.NODE_ENV === 'production') return null;
    const [user] = await this.db.select().from(users).where(eq(users.id, env.DEV_USER_ID));
    if (!user) return null;
    await this.db
      .insert(telegramAccounts)
      .values({ telegramUserId, userId: user.id, chatId })
      .onConflictDoNothing();
    this.logger.warn(`DEV: Telegram ${telegramUserId} связан с seed-пользователем ${user.id}`);
    return user.id;
  }

  private actionKeyboard(reminderId: string): InlineKeyboard {
    return new InlineKeyboard()
      .text('Готово', `done:${reminderId}`)
      .text('Через час', `hour:${reminderId}`)
      .row()
      .text('Вечером', `evening:${reminderId}`)
      .text('Завтра', `tomorrow:${reminderId}`)
      .row()
      .text('Удалить', `delete:${reminderId}`);
  }

  private registerHandlers(bot: Bot): void {
    bot.command('start', async (ctx) => {
      const userId = await this.resolveUser(String(ctx.from?.id), String(ctx.chat.id));
      await ctx.reply(
        userId
          ? 'Привет. Пиши что угодно — мысль попадёт во «Входящие», а «напомни…» станет напоминанием.'
          : 'Аккаунт не связан. В production нужна авторизация через приложение.',
      );
    });

    bot.command('cancel', async (ctx) => {
      const userId = await this.resolveUser(String(ctx.from?.id), String(ctx.chat.id));
      if (!userId) return;
      const last = await this.reminders.lastCreated(userId);
      if (!last) {
        await ctx.reply('Нечего отменять.');
        return;
      }
      await this.reminders.remove(userId, last.id);
      await ctx.reply(`Отменил: «${last.text}».`);
    });

    bot.on('callback_query:data', async (ctx) => {
      const userId = await this.resolveUser(String(ctx.from.id), String(ctx.chat?.id ?? ''));
      if (!userId) return;
      const [action, id] = (ctx.callbackQuery.data ?? '').split(':');
      if (!action || !id) return;

      if (action === 'setdate') {
        const pending = this.pending.get(String(ctx.chat?.id));
        if (!pending) {
          await ctx.answerCallbackQuery('Уже неактуально');
          return;
        }
        const timezone = await this.timezoneOf(userId);
        const today = todayInTimezone(timezone);
        const date = id === 'today' ? today : this.plusDay(today);
        const time = id === 'today' ? '20:00' : pending.time;
        const reminder = await this.reminders.create(userId, {
          text: pending.text,
          scheduledDate: date,
          scheduledTime: time,
          source: 'telegram',
        });
        this.pending.delete(String(ctx.chat?.id));
        await ctx.answerCallbackQuery();
        await ctx.reply(
          `Напомню ${formatLongDate(date)}${time ? ` в ${time}` : ' в утренней сводке'}: «${reminder.text}».`,
          { reply_markup: this.actionKeyboard(reminder.id) },
        );
        return;
      }

      if (action === 'confirm') {
        await ctx.answerCallbackQuery('Подтверждено');
        return;
      }

      try {
        if (action === 'done') await this.reminders.complete(userId, id);
        else if (action === 'delete') await this.reminders.remove(userId, id);
        else if (action === 'hour') await this.reminders.snooze(userId, id, { mode: 'hour' });
        else if (action === 'evening') await this.reminders.snooze(userId, id, { mode: 'evening' });
        else if (action === 'tomorrow')
          await this.reminders.snooze(userId, id, { mode: 'tomorrow' });
        const labels: Record<string, string> = {
          done: 'Отметил.',
          delete: 'Удалил.',
          hour: 'Вернусь через час.',
          evening: 'Вернусь вечером.',
          tomorrow: 'Перенёс на завтра.',
        };
        await ctx.answerCallbackQuery();
        await ctx.reply(labels[action] ?? 'Готово.');
      } catch {
        await ctx.answerCallbackQuery('Напоминание уже недоступно');
      }
    });

    bot.on('message:text', async (ctx) => {
      const chatId = String(ctx.chat.id);
      const userId = await this.resolveUser(String(ctx.from?.id), chatId);
      if (!userId) {
        await ctx.reply('Аккаунт не связан.');
        return;
      }
      const timezone = await this.timezoneOf(userId);
      const today = todayInTimezone(timezone);
      const raw = ctx.message.text;

      // ответ на вопрос «когда напомнить?»
      const pending = this.pending.get(chatId);
      if (pending) {
        const answer = parseRelativePhrase(`напомни ${raw}`, today);
        if (answer.date) {
          this.pending.delete(chatId);
          const reminder = await this.reminders.create(userId, {
            text: pending.text,
            scheduledDate: answer.date,
            scheduledTime: answer.time ?? pending.time,
            source: 'telegram',
          });
          await ctx.reply(
            `Напомню ${formatLongDate(answer.date)}${reminder.scheduledTime ? ` в ${reminder.scheduledTime}` : ' в утренней сводке'}: «${reminder.text}».`,
            { reply_markup: this.actionKeyboard(reminder.id) },
          );
          return;
        }
      }

      const parsed = parseRelativePhrase(raw, today);

      if (!parsed.isReminder) {
        await this.inbox.create(userId, { originalText: raw, source: 'telegram' });
        await ctx.reply('Сохранил во входящие. Ничего делать не надо.');
        return;
      }

      if (!parsed.date) {
        this.pending.set(chatId, { text: parsed.text, time: parsed.time });
        await ctx.reply(`Когда напомнить: «${parsed.text}»?`, {
          reply_markup: new InlineKeyboard()
            .text('Сегодня вечером', 'setdate:today')
            .text('Завтра', 'setdate:tomorrow'),
        });
        return;
      }

      const reminder = await this.reminders.create(userId, {
        text: parsed.text,
        scheduledDate: parsed.date,
        scheduledTime: parsed.time,
        source: 'telegram',
      });

      // День недели всегда подтверждаем: «в субботу» неоднозначно.
      const prefix = parsed.ambiguousWeekday
        ? `Ты имеешь в виду ${parsed.ambiguousWeekday}, ${formatLongDate(parsed.date)}? `
        : '';
      await ctx.reply(
        `${prefix}Напомню ${formatLongDate(parsed.date)}${parsed.time ? ` в ${parsed.time}` : ' в утренней сводке'}: «${reminder.text}».`,
        { reply_markup: this.actionKeyboard(reminder.id) },
      );
    });
  }

  private plusDay(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  private async timezoneOf(userId: string): Promise<string> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    return user?.timezone ?? env.APP_TIMEZONE;
  }
}
