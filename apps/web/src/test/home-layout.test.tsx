import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from './render.js';
import type { Reminder } from '@planner/contracts';
import { makeDashboard, makeTask } from './fixtures.js';

const iso = '2026-08-27T09:00:00.000Z';

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: 'rem-1',
  userId: 'user-1',
  text: 'Полить цветы',
  scheduledDate: '2026-08-27',
  scheduledTime: null,
  timeSlot: null,
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

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () =>
        makeDashboard({
          events: [
            {
              id: 'ev-1',
              title: 'Рабочий созвон',
              time: '11:00',
              duration: '1 ч',
              calendarName: 'Работа',
            },
          ],
          dueTasks: [makeTask({ id: 'due-1', title: 'Отправить самопробу' })],
          overdueTasks: [
            makeTask({ id: 'old-1', title: 'Старая задача про сайт', deadline: '2026-07-01' }),
          ],
          todayReminders: [
            reminder(),
            reminder({ id: 'rem-2', text: 'Позвонить педагогу', scheduledTime: '18:00' }),
          ],
        }),
      directions: { list: async () => [] },
    },
  };
});

const { HomePage } = await import('../routes/HomePage.js');

/**
 * Главная разводит три вида дел по своим блокам, чтобы они не смешивались:
 * «Сегодня» — только календарь; «Дедлайны» под ним — задачи со сроком,
 * просроченные и сегодняшние вместе; напоминания — справа, над меню.
 */
describe('главная: раскладка блоков', () => {
  it('«Сегодня» — только события календаря', async () => {
    renderWithProviders(<HomePage />, '/');
    const today = await screen.findByRole('region', { name: 'Сегодня' });

    expect(within(today).getByText('Рабочий созвон')).toBeInTheDocument();
    expect(within(today).queryByText('Отправить самопробу')).not.toBeInTheDocument();
    expect(within(today).queryByText('Позвонить педагогу')).not.toBeInTheDocument();
  });

  it('дедлайны — один блок: и просроченные, и сегодняшние, сразу видны', async () => {
    renderWithProviders(<HomePage />, '/');
    const deadlines = await screen.findByRole('region', { name: 'Дедлайны' });

    expect(within(deadlines).getByText('Старая задача про сайт')).toBeInTheDocument();
    expect(within(deadlines).getByText('Отправить самопробу')).toBeInTheDocument();
    expect(within(deadlines).getByText('Срок прошёл')).toBeInTheDocument();
  });

  it('дедлайны стоят над «В фокусе»', async () => {
    renderWithProviders(<HomePage />, '/');
    const deadlines = await screen.findByRole('region', { name: 'Дедлайны' });
    const focus = screen.getByRole('region', { name: 'Фокус' });

    expect(deadlines.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('напоминания — справа: со временем и без, со ссылкой на общий список', async () => {
    renderWithProviders(<HomePage />, '/');
    const reminders = await screen.findByRole('region', { name: 'Напоминания' });

    expect(reminders.closest('.right-col')).not.toBeNull();
    expect(within(reminders).getByText('Позвонить педагогу')).toBeInTheDocument();
    expect(within(reminders).getByText('Полить цветы')).toBeInTheDocument();
    expect(reminders.querySelector('a[href="/reminders"]')).not.toBeNull();
  });

  it('без задач со сроком блока «Дедлайны» нет', async () => {
    const { api } = await import('../api/client.js');
    const original = api.dashboard;
    (api as { dashboard: unknown }).dashboard = async () =>
      makeDashboard({ dueTasks: [], overdueTasks: [] });
    renderWithProviders(<HomePage />, '/');

    await screen.findByRole('region', { name: 'Сегодня' });
    expect(screen.queryByRole('region', { name: 'Дедлайны' })).not.toBeInTheDocument();
    (api as { dashboard: unknown }).dashboard = original;
  });
});
