import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from './render.js';
import { makeDashboard, makeFocus, makeTask } from './fixtures.js';

const dashboard = vi.fn();

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: () => dashboard(),
      directions: { list: async () => [] },
      projects: { listByDirection: async () => [] },
      reminders: { archive: async () => [], complete: async () => ({}) },
      inbox: { create: async () => ({}) },
      focus: { clearActiveTask: async () => makeFocus(), setDirection: async () => makeFocus() },
      tasks: {
        activate: async () => ({}),
        complete: async () => ({}),
        pin: async () => ({}),
        unpin: async () => ({}),
        listByProject: async () => [],
        pinned: async () => [],
      },
      media: { pinned: async () => [] },
      touches: { heatmap: async () => ({ days: [] }) },
    },
  };
});

const { HomePage } = await import('../routes/HomePage.js');

/**
 * Просроченное не смешивается с лентой «Сегодня» (там напоминания и
 * расписание дня): у него своя карточка под фокусом, и в ней задачи видны
 * сразу, списком, как дедлайны — без сворачивания.
 */
describe('просроченные задачи на главной', () => {
  it('живут своей карточкой и видны сразу, без кнопки «посмотреть»', async () => {
    dashboard.mockResolvedValue(
      makeDashboard({
        dueTasks: [makeTask({ id: 'due-1', title: 'Отправить самопробу', deadline: '2026-08-27' })],
        overdueTasks: [
          makeTask({ id: 'old-1', title: 'Старая задача про сайт', deadline: '2026-07-01' }),
          makeTask({ id: 'old-2', title: 'Старая задача про визитки', deadline: '2026-06-15' }),
        ],
      }),
    );
    renderWithProviders(<HomePage />);

    const card = await screen.findByRole('region', { name: 'Просроченные задачи' });
    expect(within(card).getByText('Старая задача про сайт')).toBeInTheDocument();
    expect(within(card).getByText('Старая задача про визитки')).toBeInTheDocument();
    expect(screen.queryByText(/Просрочено:/)).not.toBeInTheDocument();

    const today = screen.getByRole('region', { name: 'Сегодня' });
    expect(within(today).getByText('Отправить самопробу')).toBeInTheDocument();
    expect(within(today).queryByText('Старая задача про сайт')).not.toBeInTheDocument();
  });

  it('без просроченного карточки нет', async () => {
    dashboard.mockResolvedValue(makeDashboard({ dueTasks: [], overdueTasks: [] }));
    renderWithProviders(<HomePage />);

    await screen.findByRole('region', { name: 'Сегодня' });
    expect(screen.queryByRole('region', { name: 'Просроченные задачи' })).not.toBeInTheDocument();
  });
});
