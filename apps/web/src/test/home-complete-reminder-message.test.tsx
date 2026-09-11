import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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
      dashboard: async () => makeDashboard({ todayReminders: [reminder()] }),
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
});
