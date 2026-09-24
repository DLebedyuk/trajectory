import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
 * Главная не должна начинаться со списка всего просроченного:
 * приложение считает пройденное, а не хвост несделанного.
 */
describe('хвост просроченного на главной', () => {
  it('показывает сегодняшнее, а просроченное сворачивает в одну строку', async () => {
    dashboard.mockResolvedValue(
      makeDashboard({
        dueTasks: [makeTask({ id: 'due-1', title: 'Отправить самопробу', deadline: '2026-08-27' })],
        overdueTasks: [
          makeTask({ id: 'old-1', title: 'Старая задача про сайт', deadline: '2026-07-01' }),
          makeTask({ id: 'old-2', title: 'Старая задача про визитки', deadline: '2026-06-15' }),
          makeTask({ id: 'old-3', title: 'Старая задача про фото', deadline: '2026-05-30' }),
        ],
      }),
    );
    renderWithProviders(<HomePage />);

    await screen.findByText('Отправить самопробу');
    expect(screen.queryByText('Старая задача про сайт')).not.toBeInTheDocument();
    expect(screen.getByText(/Просрочено: 3/)).toBeInTheDocument();
  });

  it('просроченное раскрывается по желанию', async () => {
    dashboard.mockResolvedValue(
      makeDashboard({
        dueTasks: [],
        overdueTasks: [
          makeTask({ id: 'old-1', title: 'Старая задача про сайт', deadline: '2026-07-01' }),
        ],
      }),
    );
    renderWithProviders(<HomePage />);
    const user = userEvent.setup();

    const toggle = await screen.findByRole('button', { name: /Просрочено: 1/ });
    await user.click(toggle);
    expect(await screen.findByText('Старая задача про сайт')).toBeInTheDocument();
  });

  it('просроченные задачи живут своей карточкой, а не в ленте «Сегодня»', async () => {
    dashboard.mockResolvedValue(
      makeDashboard({
        dueTasks: [],
        overdueTasks: [
          makeTask({ id: 'old-1', title: 'Старая задача про сайт', deadline: '2026-07-01' }),
        ],
      }),
    );
    renderWithProviders(<HomePage />);

    const card = await screen.findByRole('region', { name: 'Просроченные задачи' });
    expect(within(card).getByRole('button', { name: /Просрочено: 1/ })).toBeInTheDocument();
    const today = screen.getByRole('region', { name: 'Сегодня' });
    expect(within(today).queryByText(/Просрочено/)).not.toBeInTheDocument();
  });
});
