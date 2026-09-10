import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_DB_URL } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

let TelegramService: typeof import('../src/modules/telegram/telegram.service.js').TelegramService;

beforeAll(async () => {
  ({ TelegramService } = await import('../src/modules/telegram/telegram.service.js'));
});

const USER_ID = '00000000-0000-4000-8000-0000000000ff';
const CHAT_ID = '555';
const TODAY = '2026-09-14'; // понедельник

const create = vi.fn(
  async (
    _userId: string,
    input: { text: string; scheduledDate: string; scheduledTime?: unknown; timeSlot?: unknown },
  ) => ({
    id: 'reminder-1',
    text: input.text,
    scheduledDate: input.scheduledDate,
    scheduledTime: (input.scheduledTime as string | null) ?? null,
    timeSlot: (input.timeSlot as string | null) ?? null,
  }),
);
const update = vi.fn(
  async (
    _userId: string,
    id: string,
    input: {
      text?: string;
      scheduledDate?: string;
      scheduledTime?: unknown;
      timeSlot?: unknown;
    },
  ) => ({
    id,
    text: input.text ?? 'Позвонить в театр',
    scheduledDate: input.scheduledDate ?? '2026-09-19',
    scheduledTime: (input.scheduledTime as string | null) ?? null,
    timeSlot: (input.timeSlot as string | null) ?? null,
  }),
);
const inboxCreate = vi.fn(async () => ({ id: 'inbox-1' }));

function makeService() {
  const reminders = {
    create,
    update,
    lastCreated: async () => null,
    remove: vi.fn(),
    complete: vi.fn(),
    snooze: vi.fn(),
  };
  const inbox = { create: inboxCreate };
  const router = { register: vi.fn() };
  const link = { redeemCode: vi.fn(), status: vi.fn(), issueCode: vi.fn(), disconnect: vi.fn() };
  return new TelegramService(
    {} as never,
    reminders as never,
    inbox as never,
    router as never,
    link as never,
  );
}

/**
 * «в субботу» неоднозначно: это ближайшая суббота или следующая?
 * Бот не имеет права записать догадку и только потом спросить.
 */
describe('телеграм: подтверждение неоднозначного дня недели', () => {
  beforeEach(() => {
    create.mockClear();
    update.mockClear();
    inboxCreate.mockClear();
  });

  it('на «напомни в субботу» сначала спрашивает и ничего не создаёт', async () => {
    const service = makeService();
    const reply = await service.handleText(
      USER_ID,
      CHAT_ID,
      'напомни в субботу позвонить в театр',
      TODAY,
    );

    expect(create).not.toHaveBeenCalled();
    expect(reply.text).toContain('субботу');
    expect(reply.actions?.map((a) => a.data)).toContain('confirm:yes');
    expect(reply.actions?.map((a) => a.data)).toContain('confirm:no');
  });

  it('после подтверждения с известным временем создаёт напоминание на названную дату', async () => {
    const service = makeService();
    await service.handleText(
      USER_ID,
      CHAT_ID,
      'напомни в субботу вечером позвонить в театр',
      TODAY,
    );
    const reply = await service.handleAction(USER_ID, CHAT_ID, 'confirm:yes', TODAY);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[1].scheduledDate).toBe('2026-09-19');
    expect(create.mock.calls[0]?.[1].text).toBe('Позвонить в театр');
    expect(create.mock.calls[0]?.[1].timeSlot).toBe('evening');
    expect(reply.text).toContain('Напомню');
    expect(reply.text).toContain('верно?');
    expect(reply.actions?.map((a) => a.data)).toEqual([
      'remindyes:reminder-1',
      'remindedit:reminder-1',
    ]);
  });

  it('подтверждение без времени создаёт сразу — переспрашивать нечего, слот подбирает сервис', async () => {
    const service = makeService();
    await service.handleText(USER_ID, CHAT_ID, 'напомни в субботу позвонить в театр', TODAY);
    const reply = await service.handleAction(USER_ID, CHAT_ID, 'confirm:yes', TODAY);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[1].scheduledDate).toBe('2026-09-19');
    expect(create.mock.calls[0]?.[1].timeSlot).toBeNull();
    expect(reply.text).toContain('Напомню');
  });

  it('«Да» на подтверждении открывает быстрые действия, ничего не пересоздавая', async () => {
    const service = makeService();
    const reply = await service.handleAction(USER_ID, CHAT_ID, 'remindyes:reminder-1', TODAY);

    expect(create).not.toHaveBeenCalled();
    expect(reply.actions?.map((a) => a.data)).toEqual([
      'done:reminder-1',
      'hour:reminder-1',
      'evening:reminder-1',
      'tomorrow:reminder-1',
      'delete:reminder-1',
    ]);
  });

  it('«Изменить» ждёт свободный текст и правит то же напоминание, а не создаёт новое', async () => {
    const service = makeService();
    const ask = await service.handleAction(USER_ID, CHAT_ID, 'remindedit:reminder-1', TODAY);
    expect(ask.text).toContain('Когда напомнить');
    expect(ask.actions).toBeUndefined();

    const reply = await service.handleText(USER_ID, CHAT_ID, 'в 18:00', TODAY);

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[1]).toBe('reminder-1');
    expect(update.mock.calls[0]?.[2]).toEqual({ scheduledTime: '18:00' });
    expect(reply.text).toContain('верно?');
  });

  it('«Изменить» без понятного времени переспрашивает ещё раз, не выдумывая', async () => {
    const service = makeService();
    await service.handleAction(USER_ID, CHAT_ID, 'remindedit:reminder-1', TODAY);
    const reply = await service.handleText(USER_ID, CHAT_ID, 'угу супер', TODAY);

    expect(update).not.toHaveBeenCalled();
    expect(reply.text).toContain('Не поняла время');

    // и продолжает ждать — следующая попытка всё ещё правит то же напоминание
    await service.handleText(USER_ID, CHAT_ID, 'днём', TODAY);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[1]).toBe('reminder-1');
  });

  it('после отказа переспрашивает и не создаёт напоминание', async () => {
    const service = makeService();
    await service.handleText(USER_ID, CHAT_ID, 'напомни в субботу позвонить в театр', TODAY);
    const reply = await service.handleAction(USER_ID, CHAT_ID, 'confirm:no', TODAY);

    expect(create).not.toHaveBeenCalled();
    expect(reply.text).toContain('Когда напомнить');
  });

  it('однозначную дату с точным временем не переспрашивает', async () => {
    const service = makeService();
    const reply = await service.handleText(
      USER_ID,
      CHAT_ID,
      'напомни завтра в 18:00 купить хлеб',
      TODAY,
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[1].scheduledDate).toBe('2026-09-15');
    expect(create.mock.calls[0]?.[1].scheduledTime).toBe('18:00');
    expect(reply.text).toContain('Напомню');
  });

  it('однозначная дата без времени тоже создаёт сразу, без переспроса', async () => {
    const service = makeService();
    const reply = await service.handleText(USER_ID, CHAT_ID, 'напомни завтра купить хлеб', TODAY);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[1].scheduledDate).toBe('2026-09-15');
    expect(create.mock.calls[0]?.[1].timeSlot).toBeNull();
    expect(reply.text).toContain('Напомню');
    expect(reply.text).toContain('верно?');
  });

  it('«напомни мне» совсем без даты и времени не переспрашивает — берёт ближайший слот', async () => {
    const service = makeService();
    const reply = await service.handleText(USER_ID, CHAT_ID, 'напомни выпить воды', TODAY);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[1].scheduledDate).toBe(TODAY);
    expect(reply.text).toContain('Напомню');
  });

  it('обычную мысль кладёт во входящие', async () => {
    const service = makeService();
    const reply = await service.handleText(
      USER_ID,
      CHAT_ID,
      'посмотреть спектакль в Практике',
      TODAY,
    );

    expect(inboxCreate).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(reply.text).toContain('входящие');
  });
});
