import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render.js';
import { makeDashboard, makeFocus, makeProject } from './fixtures.js';

const pin = vi.fn(async (_id: string) => makeProject());
const unpin = vi.fn(async (_id: string) => makeProject({ pinned: false }));

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () =>
        makeDashboard({
          focus: makeFocus({ activeTaskId: null, activeTask: null }),
          pinnedProject: makeProject({ title: 'Подготовить демо для сайта' }),
        }),
      directions: { list: async () => [] },
      projects: {
        listByDirection: async () => [
          {
            ...makeProject({ title: 'Подготовить демо для сайта' }),
            pinnedCount: 0,
            hasActiveTask: false,
            activeTaskTitle: null,
            openTaskCount: 2,
          },
          {
            ...makeProject({ id: 'project-2', title: 'Обновить сайт озвучки', pinned: false }),
            pinnedCount: 0,
            hasActiveTask: false,
            activeTaskTitle: null,
            openTaskCount: 1,
          },
        ],
        pin: (id: string) => pin(id),
        unpin: (id: string) => unpin(id),
      },
      reminders: { complete: async () => ({}) },
      media: { pinned: async () => [] },
      touches: { heatmap: async () => ({ days: [] }) },
      tasks: { complete: async () => ({}) },
      focus: { clearActiveTask: async () => makeFocus(), setDirection: async () => makeFocus() },
      inbox: { create: async () => ({}) },
    },
  };
});

const { HomePage } = await import('../routes/HomePage.js');

/**
 * Закреплённый проект принадлежит направлению: на главной виден тот, чьё
 * направление в фокусе. Отдельного блока «Закреплённое» с задачами больше нет.
 */
describe('закреплённый проект на главной', () => {
  it('показан в связке фокуса, а не отдельным блоком с задачами', async () => {
    renderWithProviders(<HomePage />, '/');

    await screen.findByText('Подготовить демо для сайта');
    expect(document.querySelector('.focus-block')?.textContent).toContain(
      'Подготовить демо для сайта',
    );
    expect(screen.queryByText('Закреплённое')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Закрепить' })).not.toBeInTheDocument();
  });

  it('сменить закрепление можно из блока фокуса', async () => {
    pin.mockClear();
    renderWithProviders(<HomePage />, '/');
    const user = userEvent.setup();

    await screen.findByText('Подготовить демо для сайта');
    await user.click(screen.getByRole('button', { name: 'Ещё действия' }));
    await user.click(await screen.findByText('Сменить закреплённый проект'));

    await user.click(await screen.findByText('Обновить сайт озвучки'));
    expect(pin).toHaveBeenCalledWith('project-2');
  });
});
