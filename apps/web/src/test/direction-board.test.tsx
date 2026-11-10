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
  return { ...task, isActive: false, boardColumnId: null, ...over };
};

let board: Board;
let projects: ProjectWithFlags[];
const updates: { id: string; input: unknown }[] = [];
const reopened: string[] = [];
const moved: { id: string; columnId: string | null }[] = [];
const created: unknown[] = [];

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
        create: async (input: { projectId: string; title: string }) => {
          created.push(input);
          return { id: `new-${created.length}`, ...input };
        },
        move: async (id: string, columnId: string | null) => {
          moved.push({ id, columnId });
          board = {
            ...board,
            tasks: board.tasks.map((t) =>
              t.id === id ? { ...t, status: 'open', boardColumnId: columnId } : t,
            ),
          };
          return {};
        },
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
    moved.length = 0;
    created.length = 0;
    try {
      localStorage.clear();
    } catch {
      // нет хранилища — не страшно
    }
    projects = [
      flags({ id: 'p-a', title: 'Мультфильм A', showOnBoard: true }),
      flags({ id: 'p-b', title: 'Мультфильм B', showOnBoard: true }),
      flags({ id: 'p-c', title: 'Аудиокнига C' }),
    ];
    board = {
      columns: [],
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
    board = { columns: [], projects: [], tasks: [] };
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

  it('без тега карточка уходит в проект по умолчанию и поле очищается', async () => {
    render();
    await screen.findByText('Серия 7');
    const user = userEvent.setup();
    const field = screen.getByRole('combobox', { name: 'Новая карточка в «К выполнению»' });
    await user.type(field, 'Серия 9');
    expect(screen.getByText(/по умолчанию/)).toHaveTextContent('Мультфильм A');
    await user.keyboard('{Enter}');
    expect(created).toEqual([{ projectId: 'p-a', title: 'Серия 9', pinned: false }]);
    expect(field).toHaveValue('');
  });

  it('#тег выбирает проект и вырезается из названия', async () => {
    render();
    await screen.findByText('Серия 7');
    const user = userEvent.setup();
    const field = screen.getByRole('combobox', { name: 'Новая карточка в «К выполнению»' });
    await user.type(field, 'поправить титры #мультфильмb');
    await user.keyboard('{Escape}{Enter}');
    expect(created).toEqual([{ projectId: 'p-b', title: 'поправить титры', pinned: false }]);
  });

  it('подсказка подставляет проект по Tab', async () => {
    render();
    await screen.findByText('Серия 7');
    const user = userEvent.setup();
    const field = screen.getByRole('combobox', { name: 'Новая карточка в «К выполнению»' });
    await user.type(field, 'титры #му');
    const options = within(screen.getByRole('listbox', { name: 'Проекты' })).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Мультфильм A', 'Мультфильм B']);
    await user.keyboard('{ArrowDown}{Tab}');
    expect(field).toHaveValue('титры #Мультфильм_B ');
    await user.keyboard('{Enter}');
    expect(created).toEqual([{ projectId: 'p-b', title: 'титры', pinned: false }]);
  });

  it('неизвестный тег не создаёт карточку', async () => {
    render();
    await screen.findByText('Серия 7');
    const user = userEvent.setup();
    await user.type(
      screen.getByRole('combobox', { name: 'Новая карточка в «К выполнению»' }),
      'титры #кот{Enter}',
    );
    expect(screen.getByText('#кот — нет такого проекта на доске')).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  describe('свои столбцы', () => {
    beforeEach(() => {
      board = {
        ...board,
        columns: [
          { id: 'c-debts', directionId: 'dir-voice', title: 'Долги', sortOrder: 0 },
          { id: 'c-today', directionId: 'dir-voice', title: 'Сегодня', sortOrder: 1 },
          { id: 'c-fix', directionId: 'dir-voice', title: 'На фиксах', sortOrder: 2 },
        ],
        tasks: board.tasks.map((t) => (t.id === 't-2' ? { ...t, boardColumnId: 'c-fix' } : t)),
      };
    });

    it('раскладывает открытые задачи по столбцам, без столбца — в первый', async () => {
      render();
      await screen.findByText('Серия 7');
      expect(within(column('Долги')).getByText('Серия 1')).toBeInTheDocument();
      expect(within(column('На фиксах')).getByText('Серия 7')).toBeInTheDocument();
      expect(within(column('Сегодня')).queryByText('Серия 1')).not.toBeInTheDocument();
      expect(within(column('Готово')).getByText('Серия 2')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'К выполнению' })).not.toBeInTheDocument();
    });

    it('карточка из поля столбца создаётся в этом столбце', async () => {
      render();
      await screen.findByText('Серия 7');
      const user = userEvent.setup();
      await user.type(
        screen.getByRole('combobox', { name: 'Новая карточка в «Сегодня»' }),
        'Серия 3 #мультфильмa{Escape}{Enter}',
      );
      expect(created).toEqual([
        { projectId: 'p-a', title: 'Серия 3', pinned: false, boardColumnId: 'c-today' },
      ]);
    });

    it('меню карточки переносит между столбцами', async () => {
      render();
      await screen.findByText('Серия 1');
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Действия: Серия 1' }));
      expect(screen.queryByRole('menuitem', { name: 'Перенести в «Долги»' })).toBeNull();
      await user.click(screen.getByRole('menuitem', { name: 'Перенести в «Сегодня»' }));
      expect(moved).toEqual([{ id: 't-1', columnId: 'c-today' }]);
      expect(within(column('Сегодня')).getByText('Серия 1')).toBeInTheDocument();
    });

    it('из «Готово» можно вернуть сразу в нужный столбец', async () => {
      render();
      await screen.findByText('Серия 2');
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Действия: Серия 2' }));
      await user.click(screen.getByRole('menuitem', { name: 'Вернуть в «На фиксах»' }));
      expect(moved).toEqual([{ id: 't-3', columnId: 'c-fix' }]);
      expect(within(column('На фиксах')).getByText('Серия 2')).toBeInTheDocument();
    });
  });
});
