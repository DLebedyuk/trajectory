import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { ProjectWithFlags } from '@planner/contracts';
import { renderWithProviders } from './render.js';
import { makeDashboard, makeProject } from './fixtures.js';

const direction = {
  id: 'dir-voice',
  userId: 'user-1',
  name: 'Озвучка',
  description: null,
  color: '--d-voice',
  icon: 'mic',
  motto: null,
  showMotto: false,
  notes: [],
  sortOrder: 0,
  archivedAt: null,
  createdAt: '2026-08-27T09:00:00.000Z',
  updatedAt: '2026-08-27T09:00:00.000Z',
};

const flags = (over: Partial<ProjectWithFlags>): ProjectWithFlags => ({
  ...makeProject(),
  pinnedCount: 0,
  hasActiveTask: false,
  activeTaskTitle: null,
  openTaskCount: 0,
  ...over,
});

const updates: { id: string; input: unknown }[] = [];

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () => makeDashboard(),
      directions: { get: async () => direction, list: async () => [] },
      projects: {
        listByDirection: async () => [
          flags({ id: 'p-1', title: 'Обновить сайт' }),
          flags({ id: 'p-2', title: 'Подготовить демо', pinned: true, priority: 'high' }),
        ],
        update: async (id: string, input: unknown) => {
          updates.push({ id, input });
          return {};
        },
      },
      habits: { list: async () => [] },
      touches: { list: async () => [], heatmap: async () => ({ days: [], total: 0 }) },
    },
  };
});

const { DirectionPage } = await import('../routes/DirectionPage.js');

function render() {
  return renderWithProviders(
    <Routes>
      <Route path="/directions/:directionId" element={<DirectionPage />} />
      <Route path="/projects/:projectId" element={<p>страница проекта</p>} />
    </Routes>,
    '/directions/dir-voice',
  );
}

describe('закрепление и приоритет в направлении', () => {
  beforeEach(() => {
    updates.length = 0;
  });

  it('закреплённый проект стоит первым и показывает приоритет', async () => {
    render();
    await screen.findByText('Подготовить демо');
    const names = screen
      .getAllByRole('button', { name: /^(Обновить сайт|Подготовить демо)$/ })
      .map((b) => b.textContent);
    expect(names).toEqual(['Подготовить демо', 'Обновить сайт']);
    expect(screen.getByText(/высокий/)).toBeInTheDocument();
  });

  it('закрепление — одно касание и не открывает проект', async () => {
    render();
    await screen.findByText('Обновить сайт');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Закрепить проект: Обновить сайт' }));
    expect(updates).toEqual([{ id: 'p-1', input: { pinned: true } }]);
    expect(screen.queryByText('страница проекта')).not.toBeInTheDocument();
  });

  it('приоритет выбирается из меню на карточке', async () => {
    render();
    await screen.findByText('Обновить сайт');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Приоритет проекта «Обновить сайт»/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Низкий' }));
    expect(updates).toEqual([{ id: 'p-1', input: { priority: 'low' } }]);
    expect(screen.queryByText('страница проекта')).not.toBeInTheDocument();
  });
});
