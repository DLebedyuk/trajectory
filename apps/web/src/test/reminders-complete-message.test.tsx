import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Reminder } from '@planner/contracts';
import { renderWithProviders } from './render.js';
import { makeDashboard } from './fixtures.js';

const iso = '2026-08-27T09:00:00.000Z';

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: 'rem-1',
  userId: 'user-1',
  text: 'Полить орхидею',
  scheduledDate: '2026-08-27',
  scheduledTime: null,
  timeSlot: 'evening',
  timezone: 'Europe/Moscow',
  repeatRule: null,
  deliveryMode: 'digest',
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
      dashboard: async () => makeDashboard({ today: '2026-08-27' }),
      directions: { list: async () => [] },
      reminders: { list: async () => [reminder()], archive: async () => [], complete: completeApi },
      settings: {
        get: async () => ({
          userId: 'user-1',
          timezone: 'Europe/Moscow',
          locale: 'ru',
          morningTime: '10:00',
          dayTime: '15:00',
          eveningTime: '21:00',
          missedReminderRepeat: true,
          theme: 'system',
          telegramLinked: false,
          updatedAt: iso,
        }),
      },
    },
  };
});

const { RemindersPage } = await import('../routes/RemindersPage.js');

/**
 * complete() у повторяющегося напоминания не архивирует его, а переносит на
 * следующую дату (см. reminders.service.ts::complete). Сообщение об этом
 * должно говорить, а не всегда утверждать «ушло в архив». Кнопка блокируется
 * на время запроса, чтобы двойной клик не перенёс напоминание сразу на два
 * периода.
 */
describe('напоминания: сообщение и блокировка при завершении', () => {
  beforeEach(() => {
    completeApi.mockClear();
  });

  it('обычное напоминание — сообщение про архив', async () => {
    completeApi.mockResolvedValueOnce(reminder({ status: 'done', closedAt: iso }));
    const user = userEvent.setup();
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Полить орхидею');

    await user.click(screen.getByRole('button', { name: 'Выполнить: Полить орхидею' }));

    expect(await screen.findByText('Готово. Напоминание ушло в архив.')).toBeInTheDocument();
  });

  it('повторяющееся напоминание — сообщение про перенос, не про архив', async () => {
    completeApi.mockResolvedValueOnce(reminder({ repeatRule: 'daily', scheduledDate: '2026-08-28' }));
    const user = userEvent.setup();
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Полить орхидею');

    await user.click(screen.getByRole('button', { name: 'Выполнить: Полить орхидею' }));

    expect(await screen.findByText(/Отметил\. Следующее/)).toBeInTheDocument();
    expect(screen.queryByText('Готово. Напоминание ушло в архив.')).not.toBeInTheDocument();
  });

  it('кнопка блокируется на время запроса — повторный клик не отправляет второй раз', async () => {
    let resolveComplete: (r: Reminder) => void = () => {};
    completeApi.mockImplementationOnce(
      () =>
        new Promise<Reminder>((resolve) => {
          resolveComplete = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Полить орхидею');

    const btn = screen.getByRole('button', { name: 'Выполнить: Полить орхидею' });
    await user.click(btn);
    expect(btn).toBeDisabled();

    await user.click(btn);
    expect(completeApi).toHaveBeenCalledTimes(1);

    resolveComplete(reminder({ status: 'done', closedAt: iso }));
    await screen.findByText('Готово. Напоминание ушло в архив.');
  });
});
