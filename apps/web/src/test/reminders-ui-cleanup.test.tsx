import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from './render.js';
import type { Reminder } from '@planner/contracts';
import { makeDashboard } from './fixtures.js';

const reminder: Reminder = {
  id: 'rem-1',
  userId: 'user-1',
  text: 'Забрать посылку',
  scheduledDate: '2026-08-27',
  scheduledTime: '12:00',
  timeSlot: null,
  timezone: 'Europe/Moscow',
  repeatRule: null,
  deliveryMode: 'digest',
  // источник хранится и приезжает с сервера — но в интерфейсе его быть не должно
  source: 'telegram',
  comment: null,
  status: 'active',
  closedAt: null,
  createdAt: '2026-08-27T09:00:00.000Z',
  updatedAt: '2026-08-27T09:00:00.000Z',
};

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () => makeDashboard(),
      directions: { list: async () => [] },
      reminders: {
        list: async () => [reminder],
        archive: async () => [
          { ...reminder, id: 'rem-2', text: 'Позвонить в студию', status: 'done' },
        ],
      },
      settings: {
        get: async () => ({
          userId: 'user-1',
          timezone: 'Europe/Moscow',
          locale: 'ru',
          morningTime: '10:00',
          dayTime: '15:00',
          eveningTime: '21:00',
          missedReminderRepeat: true,
          morningDigestEnabled: true,
          theme: 'system',
          telegramLinked: false,
          updatedAt: '2026-08-27T09:00:00.000Z',
        }),
      },
    },
  };
});

const { RemindersPage } = await import('../routes/RemindersPage.js');
const { RemindersArchivePage } = await import('../routes/RemindersArchivePage.js');

describe('напоминания: чистка интерфейса', () => {
  it('нет кнопки «Обновить» — она дублировала перезагрузку страницы', async () => {
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Забрать посылку');

    expect(screen.queryByRole('button', { name: 'Обновить' })).not.toBeInTheDocument();
  });

  it('не показывает, что напоминание пришло из Telegram', async () => {
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Забрать посылку');

    expect(screen.queryByText('Telegram')).not.toBeInTheDocument();
    expect(document.querySelector('.is-tg')).toBeNull();
    // при этом само поле никуда не делось: оно просто не выводится
    expect(reminder.source).toBe('telegram');
  });

  it('правило про семь дней написано в архиве, а не в списке активных', async () => {
    const { unmount } = renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Забрать посылку');
    expect(screen.queryByText(/лежат там семь дней/)).not.toBeInTheDocument();
    unmount();

    renderWithProviders(
      <Routes>
        <Route path="/reminders/archive" element={<RemindersArchivePage />} />
      </Routes>,
      '/reminders/archive',
    );
    expect(await screen.findByText(/лежат там семь дней/)).toBeInTheDocument();
  });
});
