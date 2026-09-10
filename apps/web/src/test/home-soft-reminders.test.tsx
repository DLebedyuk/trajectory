import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './render.js';
import type { Reminder } from '@planner/contracts';
import { makeDashboard } from './fixtures.js';

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
 * «Не забыть сегодня» — это те же напоминания, только без времени. В ленте
 * «Сегодня», выстроенной по часам, им места нет: они стоят отдельной плашкой
 * сразу под лентой, рядом с календарём.
 */
describe('главная: напоминания без времени', () => {
  it('напоминание без времени стоит отдельной плашкой, а не в ленте «Сегодня»', async () => {
    renderWithProviders(<HomePage />, '/');
    await screen.findByText('Полить цветы');

    expect(document.querySelector('.home-main .notime-card')).not.toBeNull();
    expect(document.querySelector('.today-block .notime-block')).toBeNull();
    const inToday = document.querySelector('.today-block')?.textContent ?? '';
    expect(inToday).not.toContain('Полить цветы');
  });

  it('напоминание со временем остаётся в ленте дня', async () => {
    renderWithProviders(<HomePage />, '/');
    await screen.findByText('Позвонить педагогу');

    const inToday = document.querySelector('.today-block')?.textContent ?? '';
    expect(inToday).toContain('Позвонить педагогу');
  });

  it('из плашки можно уйти в общий список напоминаний', async () => {
    renderWithProviders(<HomePage />, '/');
    await screen.findByText('Полить цветы');

    const link = document.querySelector('.notime-card a[href="/reminders"]');
    expect(link).not.toBeNull();
  });
});
