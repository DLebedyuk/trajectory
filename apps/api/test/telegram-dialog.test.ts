import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_DB_URL } from './setup.js';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.TELEGRAM_MODE = 'off';
process.env.NODE_ENV = 'test';

const { TelegramService } = await import('../src/modules/telegram/telegram.service.js');

const USER_ID = '00000000-0000-4000-8000-0000000000ff';
const CHAT_ID = '555';
const TODAY = '2026-09-14'; // понедельник

const create = vi.fn(
  async (_userId: string, input: { text: string; scheduledDate: string; scheduledTime?: unknown }) => ({
    id: 'reminder-1',
    text: input.text,
    scheduledDate: input.scheduledDate,
    scheduledTime: (input.scheduledTime as string | null) ?? null,
  }),
);
const inboxCreate = vi.fn(async () => ({ id: 'inbox-1' }));

function makeService() {
  const reminders = { create, lastCreated: async () => null, remove: vi.fn(), complete: vi.fn(), snooze: vi.fn() };
  const inbox = { create: inboxCreate };
  const router = { register: vi.fn() };
  return new TelegramService({} as never, reminders as never, inbox as never, router as never);
}

/**
 * «в субботу» неоднозначно: это ближайшая суббота или следующая?
 * Бот не имеет права записать догадку и только потом спросить.
 */
describe('телеграм: подтверждение неоднозначного дня недели', () => {
  beforeEach(() => {
    create.mockClear();
    inboxCreate.mockClear();
  });

  it('на «напомни в субботу» сначала спрашивает и ничего не создаёт', async () => {
    const service = makeService();
    const reply = await service.handleText(USER_ID, CHAT_ID, 'напомни в субботу позвонить в театр', TODAY);

    expect(create).not.toHaveBeenCalled();
    expect(reply.text).toContain('субботу');
    expect(reply.actions?.map((a) => a.data)).toContain('confirm:yes');
    expect(reply.actions?.map((a) => a.data)).toContain('confirm:no');
  });

  it('после подтверждения создаёт напоминание на названную дату', async () => {
    const service = makeService();
    await service.handleText(USER_ID, CHAT_ID, 'напомни в субботу позвонить в театр', TODAY);
    const reply = await service.handleAction(USER_ID, CHAT_ID, 'confirm:yes', TODAY);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[1].scheduledDate).toBe('2026-09-19');
    expect(create.mock.calls[0]?.[1].text).toBe('Позвонить в театр');
    expect(reply.text).toContain('Напомню');
  });

  it('после отказа переспрашивает и не создаёт напоминание', async () => {
    const service = makeService();
    await service.handleText(USER_ID, CHAT_ID, 'напомни в субботу позвонить в театр', TODAY);
    const reply = await service.handleAction(USER_ID, CHAT_ID, 'confirm:no', TODAY);

    expect(create).not.toHaveBeenCalled();
    expect(reply.text).toContain('Когда напомнить');
  });

  it('однозначную дату не переспрашивает', async () => {
    const service = makeService();
    const reply = await service.handleText(USER_ID, CHAT_ID, 'напомни завтра купить хлеб', TODAY);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[1].scheduledDate).toBe('2026-09-15');
    expect(reply.text).toContain('Напомню');
  });

  it('обычную мысль кладёт во входящие', async () => {
    const service = makeService();
    const reply = await service.handleText(USER_ID, CHAT_ID, 'посмотреть спектакль в Практике', TODAY);

    expect(inboxCreate).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(reply.text).toContain('входящие');
  });
});
