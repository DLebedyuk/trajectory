import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { Board, BoardTask, ProjectWithFlags } from '@planner/contracts';
import { renderWithProviders } from './render.js';
import { makeDashboard, makeProject, makeTask } from './fixtures.js';

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

const card = (over: Partial<BoardTask>): BoardTask => {
  const { directionId: _d, directionName: _n, directionColor: _c, ...task } = makeTask();
  return { ...task, isActive: false, ...over };
};

let board: Board;
let projects: ProjectWithFlags[];
const updates: { id: string; input: unknown }[] = [];
const reopened: string[] = [];

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () => makeDashboard(),
      settings: { get: async () => ({ timezone: 'Europe/Moscow' }) },
      directions: { get: async () => direction, list: async () => [] },
      projects: {
        listByDirection: async () => projects,
        update: async (id: string, input: unknown) => {
          updates.push({ id, input });
          return {};
        },
      },
      tasks: {
        board: async () => board,
        reopen: async (id: string) => {
          reopened.push(id);
          // как сервер: после возврата доска отдаёт задачу открытой
          board = {
            ...board,
            tasks: board.tasks.map((t) => (t.id === id ? { ...t, status: 'open' } : t)),
          };
          return {};
        },
      },
      habits: { list: async () => [] },
      touches: { list: async () => [], heatmap: async () => ({ days: [], total: 0 }) },
    },
  };
});

const { DirectionPage } = await import('../routes/DirectionPage.js');

function render(route = '/directions/dir-voice/board') {
  return renderWithProviders(
    <Routes>
      <Route path="/directions/:directionId" element={<DirectionPage />} />
      <Route path="/directions/:directionId/board" element={<DirectionPage />} />
      <Route path="/tasks/:taskId" element={<p>страница задачи</p>} />
    </Routes>,
    route,
  );
}

const column = (name: string) => screen.getByRole('region', { name });

describe('канбан направления', () => {
  beforeEach(() => {
    updates.length = 0;
    reopened.length = 0;
    projects = [
      flags({ id: 'p-a', title: 'Мультфильм A', showOnBoard: true }),
      flags({ id: 'p-b', title: 'Мультфильм B', showOnBoard: true }),
      flags({ id: 'p-c', title: 'Аудиокнига C' }),
    ];
    board = {
      projects: [
        { id: 'p-a', title: 'Мультфильм A', status: 'active', sortOrder: 0 },
        { id: 'p-b', title: 'Мультфильм B', status: 'active', sortOrder: 1 },
      ],
      tasks: [
        card({ id: 't-1', projectId: 'p-a', projectTitle: 'Мультфильм A', title: 'Серия 1' }),
        card({ id: 't-2', projectId: 'p-b', projectTitle: 'Мультфильм B', title: 'Серия 7' }),
        card({
          id: 't-3',
          projectId: 'p-a',
          projectTitle: 'Мультфильм A',
          title: 'Серия 2',
          status: 'done',
          completedAt: '2026-08-26T10:00:00.000Z',
        }),
      ],
    };
  });

  it('раскладывает задачи по статусу и подписывает проект', async () => {
    render();
    await screen.findByText('Серия 7');
    expect(within(column('К выполнению')).getByText('Серия 1')).toBeInTheDocument();
    expect(within(column('К выполнению')).getByText('Мультфильм B')).toBeInTheDocument();
    expect(within(column('Готово')).getByText('Серия 2')).toBeInTheDocument();
  });

  it('фильтр по проекту и поиск не трогают задачи, только вид', async () => {
    render();
    await screen.findByText('Серия 7');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Мультфильм B' }));
    expect(screen.queryByText('Серия 1')).not.toBeInTheDocument();
    expect(screen.getByText('Серия 7')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'все' }));
    await user.type(screen.getByRole('searchbox'), 'серия 1');
    expect(screen.getByText('Серия 1')).toBeInTheDocument();
    expect(screen.queryByText('Серия 7')).not.toBeInTheDocument();
    expect(updates).toEqual([]);
  });

  it('«Скрыть готовые» убирает колонку «Готово»', async () => {
    render();
    await screen.findByText('Серия 2');
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Скрыть готовые' }));
    expect(screen.queryByRole('region', { name: 'Готово' })).not.toBeInTheDocument();
    expect(screen.queryByText('Серия 2')).not.toBeInTheDocument();
  });

  it('кружок на открытой карточке спрашивает про закрытие, как в проекте', async () => {
    render();
    await screen.findByText('Серия 1');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Готово: Серия 1' }));
    expect(await screen.findByText('Закрыть задачу?')).toBeInTheDocument();
    expect(screen.queryByText('страница задачи')).not.toBeInTheDocument();
  });

  it('кружок на готовой карточке возвращает задачу сразу', async () => {
    render();
    await screen.findByText('Серия 2');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Вернуть в работу: Серия 2' }));
    expect(reopened).toEqual(['t-3']);
    expect(within(column('К выполнению')).getByText('Серия 2')).toBeInTheDocument();
  });

  it('клик по карточке открывает задачу', async () => {
    render();
    await userEvent.setup().click(await screen.findByText('Серия 7'));
    expect(await screen.findByText('страница задачи')).toBeInTheDocument();
  });

  it('пустая доска объясняет себя и даёт включить проекты', async () => {
    board = { projects: [], tasks: [] };
    render();
    expect(await screen.findByText('На доске пока пусто')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByText('Аудиокнига C'));
    expect(updates).toEqual([{ id: 'p-c', input: { showOnBoard: true } }]);
  });

  it('переключатель вида ведёт с проектов на канбан', async () => {
    render('/directions/dir-voice');
    await screen.findByText('Мультфильм A');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Канбан' }));
    expect(await screen.findByText('Серия 7')).toBeInTheDocument();
  });
});
