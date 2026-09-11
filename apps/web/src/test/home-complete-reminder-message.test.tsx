import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render.js';
import type { Reminder } from '@planner/contracts';
import { makeDashboard } from './fixtures.js';

const iso = '2026-08-27T09:00:00.000Z';

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: 'rem-1',
  userId: 'user-1',
  text: 'Позвонить педагогу',
  scheduledDate: '2026-08-27',
  scheduledTime: '18:00',
  timeSlot: null,
  timezone: 'Europe/Moscow',
  repeatRule: null,
  deliveryMode: 'alert',
  source: 'web',
  comment: null,
  status: 'active',
  createdAt: iso,
  closedAt: null,
  updatedAt: iso,
  ...over,
});

const completeApi = vi.fn();

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () =>
        makeDashboard({
          todayReminders: [
            reminder(),
            reminder({ id: 'rem-2', text: 'Полить цветы', scheduledTime: null, deliveryMode: 'digest' }),
          ],
        }),
      directions: { list: async () => [] },
      reminders: { complete: completeApi },
    },
  };
});

const { HomePage } = await import('../routes/HomePage.js');

/**
 * complete() у повторяющегося напоминания не архивирует его, а переносит на
 * следующую дату — сообщение должно говорить именно об этом, а не всегда
 * «ушло в архив». Кнопка блокируется на время запроса, чтобы двойной клик не
 * перенёс повторяющееся напоминание сразу на два периода.
 */
describe('главная: сообщение и блокировка при завершении напоминания', () => {
  beforeEach(() => {
    completeApi.mockClear();
  });

  it('обычное напоминание — сообщение про архив', async () => {
    completeApi.mockResolvedValueOnce(reminder({ status: 'done', closedAt: iso }));
    const user = userEvent.setup();
    renderWithProviders(<HomePage />, '/');
    await screen.findByText('Позвонить педагогу');

    await user.click(screen.getByRole('button', { name: 'Выполнить напоминание: Позвонить педагогу' }));

    expect(await screen.findByText('Готово. Напоминание ушло в архив.')).toBeInTheDocument();
  });

  it('повторяющееся напоминание — сообщение про перенос, кнопка блокируется на время запроса', async () => {
    let resolveComplete: (r: Reminder) => void = () => {};
    completeApi.mockImplementationOnce(
      () =>
        new Promise<Reminder>((resolve) => {
          resolveComplete = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<HomePage />, '/');
    await screen.findByText('Позвонить педагогу');

    const btn = screen.getByRole('button', { name: 'Выполнить напоминание: Позвонить педагогу' });
    await user.click(btn);
    expect(btn).toBeDisabled();

    // повторный клик, пока первый запрос ещё не завершился — не должен уйти вторым запросом
    await user.click(btn);
    expect(completeApi).toHaveBeenCalledTimes(1);

    resolveComplete(reminder({ repeatRule: 'daily', scheduledDate: '2026-08-28' }));

    expect(await screen.findByText(/Отметил\. Следующее/)).toBeInTheDocument();
    expect(screen.queryByText('Готово. Напоминание ушло в архив.')).not.toBeInTheDocument();
  });

  /*
   * Раньше блокировка держалась на mutation.isPending/mutation.variables —
   * одном значении на общую мутацию, которой пользуются и TodayBlock, и
   * SoftRemindersCard. Клик по B (в другой карточке), пока A ещё летит,
   * переключал variables на B и снимал disabled с A.
   */
  it('A → B в разных карточках, пока A ещё не завершилась — блокирует обе кнопки независимо', async () => {
    let resolveA: (r: Reminder) => void = () => {};
    let resolveB: (r: Reminder) => void = () => {};
    completeApi.mockImplementationOnce(
      () =>
        new Promise<Reminder>((resolve) => {
          resolveA = resolve;
        }),
    );
    completeApi.mockImplementationOnce(
      () =>
        new Promise<Reminder>((resolve) => {
          resolveB = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<HomePage />, '/');
    await screen.findByText('Позвонить педагогу');
    await screen.findByText('Полить цветы');

    const btnA = screen.getByRole('button', { name: 'Выполнить напоминание: Позвонить педагогу' });
    const btnB = screen.getByRole('button', { name: 'Выполнить напоминание: Полить цветы' });

    await user.click(btnA);
    expect(btnA).toBeDisabled();
    expect(btnB).not.toBeDisabled();

    await user.click(btnB);
    expect(btnA).toBeDisabled();
    expect(btnB).toBeDisabled();
    expect(completeApi).toHaveBeenCalledTimes(2);

    resolveA(reminder({ status: 'done', closedAt: iso }));
    await waitFor(() => expect(btnA).not.toBeDisabled());
    expect(btnB).toBeDisabled();

    resolveB(reminder({ id: 'rem-2', status: 'done', closedAt: iso }));
    await waitFor(() => expect(btnB).not.toBeDisabled());
  });
});
