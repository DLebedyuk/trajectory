import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { Reminder } from '@planner/contracts';
import { renderWithProviders } from './render.js';
import { makeDashboard } from './fixtures.js';

const iso = '2026-08-27T09:00:00.000Z';

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: 'rem-1',
  userId: 'user-1',
  text: 'Полить цветы',
  scheduledDate: '2026-08-27',
  scheduledTime: null,
  timezone: 'Europe/Moscow',
  repeatRule: null,
  deliveryMode: 'digest',
  missedBehavior: 'none',
  source: 'web',
  comment: null,
  status: 'active',
  createdAt: iso,
  closedAt: null,
  updatedAt: iso,
  ...over,
});

const LIST: Reminder[] = [
  // регулярное, срок которого уже наступил
  reminder({ id: 'r-due', text: 'Зарядка', repeatRule: 'daily', scheduledDate: '2026-08-27' }),
  // регулярное, срок которого впереди
  reminder({
    id: 'r-later',
    text: 'Оплатить хостинг',
    repeatRule: 'monthly',
    scheduledDate: '2026-09-10',
  }),
  // разовое сегодня
  reminder({ id: 'r-today', text: 'Забрать посылку', scheduledDate: '2026-08-27' }),
  // разовое впереди
  reminder({ id: 'r-soon', text: 'Записаться к врачу', scheduledDate: '2026-09-01' }),
];

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () => makeDashboard({ today: '2026-08-27' }),
      directions: { list: async () => [] },
      reminders: { list: async () => LIST, archive: async () => [] },
    },
  };
});

const { RemindersPage } = await import('../routes/RemindersPage.js');

/** Секция по её заголовку: заголовок и карточки лежат в одном .rem-section. */
const section = (title: string): HTMLElement => {
  const heading = screen.getByText(title, { selector: '.section-title' });
  return heading.closest('.rem-section') as HTMLElement;
};

/**
 * Разделы страницы напоминаний должны быть непересекающимися: одна карточка
 * живёт ровно в одном месте. Регулярное напоминание с наступившим сроком
 * показывалось сразу в «Сегодня» и в «Регулярные», и было непонятно, где
 * из них нажимать «Готово».
 */
describe('разделы напоминаний не пересекаются', () => {
  it('наступившее регулярное показано только в «Сегодня»', async () => {
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Зарядка');

    expect(within(section('Сегодня')).getByText('Зарядка')).toBeInTheDocument();
    expect(within(section('Регулярные')).queryByText('Зарядка')).not.toBeInTheDocument();
    // при этом сама регулярность с карточки не пропала
    expect(within(section('Сегодня')).getByText('каждый день')).toBeInTheDocument();
  });

  it('регулярное со сроком впереди остаётся в «Регулярные»', async () => {
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Оплатить хостинг');

    expect(within(section('Регулярные')).getByText('Оплатить хостинг')).toBeInTheDocument();
    expect(within(section('Сегодня')).queryByText('Оплатить хостинг')).not.toBeInTheDocument();
    expect(within(section('Ближайшие')).queryByText('Оплатить хостинг')).not.toBeInTheDocument();
  });

  it('каждое напоминание встречается на странице ровно один раз', async () => {
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Зарядка');

    for (const text of ['Зарядка', 'Оплатить хостинг', 'Забрать посылку', 'Записаться к врачу']) {
      expect(screen.getAllByText(text)).toHaveLength(1);
    }
  });

  it('разделы вместе покрывают весь список', async () => {
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Зарядка');

    const counted = ['Сегодня', 'Ближайшие', 'Регулярные']
      .map((title) => within(section(title)).queryAllByRole('button', { name: 'Готово' }).length)
      .reduce((a, b) => a + b, 0);
    expect(counted).toBe(LIST.length);
  });
});
