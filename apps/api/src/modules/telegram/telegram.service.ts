import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Bot, type Context, InlineKeyboard } from 'grammy';
import { eq } from 'drizzle-orm';
import { parseRelativePhrase, formatLongDate, todayInTimezone } from '@planner/shared';
import type { Reminder, TimeSlot } from '@planner/contracts';
import { DB, type Database } from '../../db/db.module.js';
import { telegramAccounts, users } from '../../db/schema.js';
import { env, isDevAuthEnabled } from '../../config/env.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { InboxService } from '../inbox/inbox.service.js';
import { TelegramLinkService } from './telegram-link.service.js';
import { NotificationRouter } from '../reminders/providers/notification.router.js';
import type {
  NotificationProvider,
  OutgoingNotification,
} from '../reminders/providers/notification.provider.js';

const SLOT_LABEL: Record<TimeSlot, string> = { morning: 'утром', day: 'днём', evening: 'вечером' };

interface PendingPhrase {
  text: string;
  time: string | null;
  timeSlot: TimeSlot | null;
}

/** Неоднозначная дата ждёт подтверждения и до него никуда не записывается. */
interface PendingConfirmation {
  text: string;
  date: string;
  time: string | null;
  timeSlot: TimeSlot | null;
}

/** «Изменить» на подтверждении — ждём свободный ответ, тем же разбором, что и «напомни …». */
interface PendingEdit {
  reminderId: string;
}

/** Ответ бота, не зависящий от grammY: так его можно проверить тестом. */
export interface BotReply {
  text: string;
  actions?: { label: string; data: string }[];
  /** всплывающий ответ на нажатие кнопки */
  toast?: string;
}

const reminderActions = (reminderId: string): { label: string; data: string }[] => [
  { label: 'Готово', data: `done:${reminderId}` },
  { label: 'Через час', data: `hour:${reminderId}` },
  { label: 'Вечером', data: `evening:${reminderId}` },
  { label: 'Завтра', data: `tomorrow:${reminderId}` },
  { label: 'Удалить', data: `delete:${reminderId}` },
];

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
  /** Ожидающие подтверждения даты — по chatId. */
  private readonly pendingConfirm = new Map<string, PendingConfirmation>();
  /** Ожидающие нового времени после «Изменить» — по chatId. */
  private readonly pendingEdit = new Map<string, PendingEdit>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(RemindersService) private readonly reminders: RemindersService,
    @Inject(InboxService) private readonly inbox: InboxService,
    @Inject(NotificationRouter) private readonly router: NotificationRouter,
    @Inject(TelegramLinkService) private readonly link: TelegramLinkService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_MODE === 'off') {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN не задан — бот не запущен, напоминания уходят в mock-канал console.',
      );
      return;
    }
    this.bot = new Bot(env.TELEGRAM_BOT_TOKEN);
    /*
      grammY без bot.catch() не глотает ошибку обработчика — она вылетает
      наружу и валит весь процесс (об этом прямо предупреждает документация
      grammY). Один плохой апдейт — например DB на секунду недоступна —
      убивал не только сам бот, но и планировщик напоминаний в этом же
      процессе, до перезапуска контейнера. Отсюда ощущение «то приходит,
      то нет»: часть напоминаний терялась не из-за логики, а из-за краша.
    */
    this.bot.catch((err) => {
      const message = err.error instanceof Error ? err.error.message : String(err.error);
      this.logger.error(`Необработанная ошибка в апдейте ${err.ctx.update.update_id}: ${message}`);
      err.ctx.reply('Что-то пошло не так. Попробуйте ещё раз.').catch(() => {});
    });
    this.registerHandlers(this.bot);
    this.router.register(this);

    if (env.TELEGRAM_MODE === 'webhook') {
      if (!env.TELEGRAM_WEBHOOK_URL) {
        this.logger.error('TELEGRAM_MODE=webhook, но TELEGRAM_WEBHOOK_URL пуст');
        return;
      }
      if (!env.TELEGRAM_WEBHOOK_SECRET) {
        this.logger.error(
          'TELEGRAM_MODE=webhook, но TELEGRAM_WEBHOOK_SECRET пуст: ручка вебхука была бы открыта всем. Бот не запущен.',
        );
        return;
      }
      /*
        grammY отказывается обрабатывать апдейт, пока не знает, кто он такой:
        handleUpdate бросает «Bot not initialized!», если botInfo пуст. В режиме
        long polling его заполняет bot.start(), а в webhook-режиме start() не
        вызывается — значит init() нужно вызвать самим. Без этого каждый апдейт
        падал с 500, Telegram копил очередь, а бот выглядел просто молчащим.
      */
      await this.bot.init();
      await this.bot.api.setWebhook(env.TELEGRAM_WEBHOOK_URL, {
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      });
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

  private async resolveUser(telegramUserId: string): Promise<string | null> {
    const [existing] = await this.db
      .select()
      .from(telegramAccounts)
      .where(eq(telegramAccounts.telegramUserId, telegramUserId));
    return existing?.userId ?? null;
  }

  /**
   * DEVELOPMENT-ONLY: связать первого написавшего с seed-пользователем.
   * Привязано к dev-режиму авторизации, а не к NODE_ENV, чтобы случайно
   * не включиться там, где настроен настоящий вход.
   */
  private async devAutoLink(telegramUserId: string, chatId: string): Promise<string | null> {
    if (!isDevAuthEnabled) return null;
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
    const keyboard = new InlineKeyboard();
    reminderActions(reminderId).forEach((a, i) => {
      keyboard.text(a.label, a.data);
      if (i % 2 === 1) keyboard.row();
    });
    return keyboard;
  }

  /**
   * Разбор входящего текста. Вынесен из grammY, чтобы диалог можно было
   * проверить тестом без запуска бота.
   */
  async handleText(userId: string, chatId: string, raw: string, today: string): Promise<BotReply> {
    // ответ на «Изменить»: свободный текст в том же формате, что и «напомни …»
    const editing = this.pendingEdit.get(chatId);
    if (editing) {
      this.pendingEdit.delete(chatId);
      return this.applyEdit(userId, chatId, editing.reminderId, raw, today);
    }

    // ответ на вопрос «когда напомнить?» (после отклонённой неоднозначной даты)
    const pending = this.pending.get(chatId);
    if (pending) {
      const answer = parseRelativePhrase(`напомни ${raw}`, today);
      if (answer.date) {
        this.pending.delete(chatId);
        return this.createAndConfirm(userId, {
          text: pending.text,
          date: answer.date,
          time: answer.time ?? pending.time,
          timeSlot: answer.timeSlot ?? pending.timeSlot,
        });
      }
    }

    const parsed = parseRelativePhrase(raw, today);

    if (!parsed.isReminder) {
      await this.inbox.create(userId, { originalText: raw, source: 'telegram' });
      return { text: 'Сохранил во входящие. Ничего делать не надо.' };
    }

    /*
      Совсем без даты — не переспрашиваем: точное время (или «утром/днём/вечером»)
      ставит именно его, а полностью пустое «напомни мне» уходит в ближайший
      следующий слот. Оба случая решает сервис — здесь просто дата «сегодня»,
      от которой он и отталкивается.
    */
    if (!parsed.date) {
      return this.createAndConfirm(userId, {
        text: parsed.text,
        date: today,
        time: parsed.time,
        timeSlot: parsed.timeSlot,
      });
    }

    // «в субботу» неоднозначно: это ближайшая суббота или следующая?
    // Пока пользователь не подтвердил, ничего не записываем.
    if (parsed.ambiguousWeekday) {
      this.pendingConfirm.set(chatId, {
        text: parsed.text,
        date: parsed.date,
        time: parsed.time,
        timeSlot: parsed.timeSlot,
      });
      return {
        text: `Вы имеете в виду ${parsed.ambiguousWeekday}, ${formatLongDate(parsed.date)}?`,
        actions: [
          { label: `Да, ${formatLongDate(parsed.date)}`, data: 'confirm:yes' },
          { label: 'Другой день', data: 'confirm:no' },
        ],
      };
    }

    /*
      Время суток не названо («в пятницу купить билеты») — не переспрашиваем
      заранее: сервис сам поставит нейтральный слот, а «Изменить» на
      подтверждении даёт поправить это без утомительного диалога до создания.
    */
    return this.createAndConfirm(userId, {
      text: parsed.text,
      date: parsed.date,
      time: parsed.time,
      timeSlot: parsed.timeSlot,
    });
  }

  /**
   * Ответ на «Изменить»: та же грамматика, что и в «напомни …» — «в 18:00»,
   * «завтра днём», «послезавтра». Не поняли ничего — переспрашиваем ещё раз,
   * а не подставляем время сами: это уже осознанная правка человека.
   */
  private async applyEdit(
    userId: string,
    chatId: string,
    reminderId: string,
    raw: string,
    today: string,
  ): Promise<BotReply> {
    const answer = parseRelativePhrase(`напомни ${raw}`, today);
    if (!answer.date && !answer.time && !answer.timeSlot) {
      this.pendingEdit.set(chatId, { reminderId });
      return { text: 'Не поняла время. Например: «в 18:00» или «завтра днём».' };
    }
    const patch: { scheduledDate?: string; scheduledTime?: string | null; timeSlot?: TimeSlot } =
      {};
    if (answer.date) patch.scheduledDate = answer.date;
    if (answer.time) patch.scheduledTime = answer.time;
    else if (answer.timeSlot) {
      // если раньше был alert — точное время нужно явно снять, иначе слот не применится
      patch.scheduledTime = null;
      patch.timeSlot = answer.timeSlot;
    }
    try {
      const reminder = await this.reminders.update(userId, reminderId, patch);
      return this.confirmReply(reminder);
    } catch {
      return { text: 'Напоминание уже недоступно.', toast: 'Напоминание уже недоступно' };
    }
  }

  /** Обработка нажатия кнопки. Формат данных — «действие:значение». */
  async handleAction(
    userId: string,
    chatId: string,
    data: string,
    today: string,
  ): Promise<BotReply> {
    const [action, value] = data.split(':');
    if (!action || !value) return { text: 'Не понял кнопку.' };

    if (action === 'confirm') {
      const waiting = this.pendingConfirm.get(chatId);
      if (!waiting) return { text: 'Уже неактуально.', toast: 'Уже неактуально' };
      this.pendingConfirm.delete(chatId);
      if (value === 'yes') {
        return this.createAndConfirm(userId, waiting);
      }
      return this.askWhen(chatId, waiting.text, waiting.time, waiting.timeSlot);
    }

    if (action === 'setdate') {
      const waiting = this.pending.get(chatId);
      if (!waiting) return { text: 'Уже неактуально.', toast: 'Уже неактуально' };
      this.pending.delete(chatId);
      if (value === 'today') {
        return this.createAndConfirm(userId, {
          text: waiting.text,
          date: today,
          time: null,
          timeSlot: 'evening',
        });
      }
      return this.createAndConfirm(userId, {
        text: waiting.text,
        date: this.plusDay(today),
        time: waiting.time,
        timeSlot: waiting.timeSlot,
      });
    }

    // «Да» на подтверждении создания/правки — просто открывает быстрые действия
    if (action === 'remindyes') {
      return { text: 'Хорошо.', actions: reminderActions(value) };
    }

    // «Изменить» — ждём свободный текст с новым временем, а не жмём в кнопки
    if (action === 'remindedit') {
      this.pendingEdit.set(chatId, { reminderId: value });
      return { text: 'Когда напомнить?' };
    }

    try {
      if (action === 'done') await this.reminders.complete(userId, value);
      else if (action === 'delete') await this.reminders.remove(userId, value);
      else if (action === 'hour') await this.reminders.snooze(userId, value, { mode: 'hour' });
      else if (action === 'evening')
        await this.reminders.snooze(userId, value, { mode: 'evening' });
      else if (action === 'tomorrow')
        await this.reminders.snooze(userId, value, { mode: 'tomorrow' });
      else return { text: 'Не понял кнопку.' };
    } catch {
      return { text: 'Напоминание уже недоступно.', toast: 'Напоминание уже недоступно' };
    }

    const labels: Record<string, string> = {
      done: 'Отметил.',
      delete: 'Удалил.',
      hour: 'Вернусь через час.',
      evening: 'Вернусь вечером.',
      tomorrow: 'Перенёс на завтра.',
    };
    return { text: labels[action] ?? 'Готово.' };
  }

  /** Дата неизвестна вообще (например, отклонённая неоднозначная дата). */
  private askWhen(
    chatId: string,
    text: string,
    time: string | null,
    timeSlot: TimeSlot | null,
  ): BotReply {
    this.pending.set(chatId, { text, time, timeSlot });
    return {
      text: `Когда напомнить: «${text}»?`,
      actions: [
        { label: 'Сегодня вечером', data: 'setdate:today' },
        { label: 'Завтра', data: 'setdate:tomorrow' },
      ],
    };
  }

  private async createAndConfirm(
    userId: string,
    input: { text: string; date: string; time: string | null; timeSlot: TimeSlot | null },
  ): Promise<BotReply> {
    const reminder = await this.reminders.create(userId, {
      text: input.text,
      scheduledDate: input.date,
      scheduledTime: input.time,
      timeSlot: input.timeSlot,
      source: 'telegram',
    });
    return this.confirmReply(reminder);
  }

  /**
   * Единая карточка подтверждения — что для создания, что для правки.
   * Ответ ровно два: «Да» (ничего решать не надо — сохранено уже сейчас,
   * кнопка открывает быстрые действия) и «Изменить» (просто написать когда).
   * Дата/время в тексте — то, что реально сохранил сервис, а не что просили:
   * прошедший слот мог уехать на завтра, «ближайший» — подобраться сам.
   */
  private confirmReply(reminder: Reminder): BotReply {
    const when = reminder.scheduledTime
      ? ` в ${reminder.scheduledTime}`
      : reminder.timeSlot
        ? ` ${SLOT_LABEL[reminder.timeSlot]}`
        : '';
    return {
      text: `Напомню ${formatLongDate(reminder.scheduledDate)}${when}: «${reminder.text}» — верно?`,
      actions: [
        { label: 'Да', data: `remindyes:${reminder.id}` },
        { label: 'Изменить', data: `remindedit:${reminder.id}` },
      ],
    };
  }

  private registerHandlers(bot: Bot): void {
    const reply = async (ctx: Context, r: BotReply): Promise<void> => {
      const keyboard = new InlineKeyboard();
      (r.actions ?? []).forEach((a, i) => {
        keyboard.text(a.label, a.data);
        if (i % 2 === 1) keyboard.row();
      });
      await ctx.reply(r.text, r.actions?.length ? { reply_markup: keyboard } : undefined);
    };

    bot.command('start', async (ctx) => {
      const telegramUserId = String(ctx.from?.id);
      const chatId = String(ctx.chat.id);
      const payload = (ctx.match ?? '').toString().trim();

      if (payload) {
        try {
          await this.link.redeemCode(payload, {
            telegramUserId,
            chatId,
            username: ctx.from?.username ?? null,
          });
          await ctx.reply(
            'Аккаунт связан. Пишите что угодно — мысль попадёт во «Входящие», ' +
              'а «напомни…» станет напоминанием.',
          );
        } catch {
          await ctx.reply(
            'Код не подошёл: он уже использован или устарел. ' +
              'Откройте «Настройки» в «Траектории» и получите новый.',
          );
        }
        return;
      }

      const known =
        (await this.resolveUser(telegramUserId)) ??
        (await this.devAutoLink(telegramUserId, chatId));
      await ctx.reply(
        known
          ? 'Привет. Пишите что угодно — мысль попадёт во «Входящие», а «напомни…» станет напоминанием.'
          : 'Этот чат ещё не связан с аккаунтом. Откройте «Настройки» в «Траектории», ' +
              'нажмите «Подключить Telegram» и пришлите сюда полученный код.',
      );
    });

    bot.command('cancel', async (ctx) => {
      const userId = await this.resolveUser(String(ctx.from?.id));
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
      const chatId = String(ctx.chat?.id ?? '');
      const userId = await this.resolveUser(String(ctx.from.id));
      if (!userId) return;
      const today = todayInTimezone(await this.timezoneOf(userId));
      const result = await this.handleAction(userId, chatId, ctx.callbackQuery.data ?? '', today);
      await ctx.answerCallbackQuery(result.toast);
      await reply(ctx, result);
    });

    bot.on('message:text', async (ctx) => {
      const chatId = String(ctx.chat.id);
      const userId =
        (await this.resolveUser(String(ctx.from?.id))) ??
        (await this.devAutoLink(String(ctx.from?.id), chatId));
      if (!userId) {
        await ctx.reply(
          'Этот чат не связан с аккаунтом. Откройте «Настройки» в «Траектории», ' +
            'нажмите «Подключить Telegram» и пришлите сюда код.',
        );
        return;
      }
      const today = todayInTimezone(await this.timezoneOf(userId));
      await reply(ctx, await this.handleText(userId, chatId, ctx.message.text, today));
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
