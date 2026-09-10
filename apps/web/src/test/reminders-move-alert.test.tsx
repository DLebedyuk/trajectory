import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Reminder, UpdateReminderInput } from '@planner/contracts';
import { renderWithProviders } from './render.js';
import { makeDashboard } from './fixtures.js';

const iso = '2026-08-27T09:00:00.000Z';

const reminder: Reminder = {
  id: 'rem-1',
  userId: 'user-1',
  text: 'Позвонить в студию',
  scheduledDate: '2026-08-27',
  // напоминание с точным временем — deliveryMode 'alert'
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
};

const update = vi.fn(async (_id: string, _input: UpdateReminderInput) => reminder);

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () => makeDashboard({ today: '2026-08-27' }),
      directions: { list: async () => [] },
      reminders: { list: async () => [reminder], archive: async () => [], update },
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
 * «Отложить» на напоминании с точным временем (alert) должен явно снимать
 * scheduledTime. Сервис трактует непереданное поле как «не менять» — если
 * не снять его здесь, выбранный слот молча отбрасывается, а напоминание
 * приходит по старому времени (см. reminders.service.ts::update).
 */
describe('отложить напоминание с точным временем', () => {
  it('явно снимает scheduledTime при переносе в слот', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Позвонить в студию');

    await user.click(screen.getByRole('button', { name: /Ещё действия/ }));
    await user.click(await screen.findByText('Отложить'));

    const select = await screen.findByRole('combobox');
    const options = select.querySelectorAll('option');
    // первая опция — плейсхолдер «— выбери —», берём первый настоящий слот
    await user.selectOptions(select, (options[1] as HTMLOptionElement).value);

    await user.click(screen.getByRole('button', { name: 'Перенести' }));

    expect(update).toHaveBeenCalledWith(
      'rem-1',
      expect.objectContaining({ scheduledTime: null }),
    );
  });
});
