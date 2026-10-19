import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Overview, OverviewProject, OverviewScope } from '@planner/contracts';
import { renderWithProviders } from './render.js';
import { makeProject, makeTask } from './fixtures.js';
import { useUiStore } from '../store/ui.js';

const ov = (over: Partial<OverviewProject>): OverviewProject => ({
  ...makeProject(),
  directionName: 'Озвучка',
  directionColor: '--d-voice',
  openTaskCount: 0,
  doneTaskCount: 0,
  overdueTaskCount: 0,
  nextDeadline: null,
  hasActiveTask: false,
  ...over,
});

const demo = ov({
  id: 'p-demo',
  title: 'Демо',
  pinned: true,
  priority: 'low',
  openTaskCount: 3,
  doneTaskCount: 4,
});
const site = ov({
  id: 'p-site',
  title: 'Сайт',
  pinned: true,
  priority: 'high',
  nextDeadline: '2026-08-01',
  overdueTaskCount: 1,
});
const ophelia = ov({
  id: 'p-oph',
  title: 'Офелия',
  directionId: 'dir-act',
  directionName: 'Актёрство',
  directionColor: '--d-act',
  pinned: true,
});
const loose = ov({ id: 'p-loose', title: 'Без закрепления' });

const stats = { directions: 2, projects: 4, pinned: 3, openTasks: 3, overdueTasks: 1 };
let overviewBehaviour: (scope: OverviewScope) => Promise<Overview> = async (scope) => ({
  stats,
  projects: scope === 'pinned' ? [demo, site, ophelia] : [demo, site, loose, ophelia],
});
const updates: { id: string; input: unknown }[] = [];
const reorders: string[][] = [];
const taskRequests: string[] = [];

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      ...actual.api,
      dashboard: async () => ({ today: '2026-08-29' }),
      overview: (scope: OverviewScope) => overviewBehaviour(scope),
      projects: {
        update: async (id: string, input: unknown) => {
          updates.push({ id, input });
          return {};
        },
        reorder: async (ids: string[]) => {
          reorders.push(ids);
          return { ok: true };
        },
      },
      tasks: {
        listByProject: async (projectId: string) => {
          taskRequests.push(projectId);
          return [makeTask({ id: 't-1', title: 'Записать дубль', projectId })];
        },
      },
    },
  };
});

const { OverviewPage } = await import('../routes/OverviewPage.js');

function render() {
  return renderWithProviders(
    <Routes>
      <Route path="/overview" element={<OverviewPage />} />
      <Route path="/tasks/:taskId" element={<p>страница задачи</p>} />
      <Route path="/projects/:projectId" element={<p>страница проекта</p>} />
    </Routes>,
    '/overview',
  );
}

const titles = () =>
  screen.getAllByRole('button', { name: /Показать задачи:/ }).map((b) => b.textContent);

describe('обзор', () => {
  beforeEach(() => {
    updates.length = 0;
    reorders.length = 0;
    taskRequests.length = 0;
    useUiStore.setState({ overview: { scope: 'pinned', sort: 'manual', priority: 'any' } });
    overviewBehaviour = async (scope) => ({
      stats,
      projects: scope === 'pinned' ? [demo, site, ophelia] : [demo, site, loose, ophelia],
    });
  });

  it('группирует закреплённые проекты по направлениям', async () => {
    render();
    const voice = await screen.findByRole('region', { name: 'Направление: Озвучка' });
    expect(within(voice).getByText('Демо')).toBeInTheDocument();
    expect(within(voice).getByText('Сайт')).toBeInTheDocument();
    const acting = screen.getByRole('region', { name: 'Направление: Актёрство' });
    expect(within(acting).getByText('Офелия')).toBeInTheDocument();
    expect(screen.queryByText('Без закрепления')).not.toBeInTheDocument();
  });

  it('показывает статистику и счётчики задач числами', async () => {
    render();
    const statList = await screen.findByRole('list', { name: 'Общая статистика' });
    expect(within(statList).getByText('просрочено').previousSibling).toHaveTextContent('1');
    expect(screen.getByText('сделано 4 · открыто 3')).toBeInTheDocument();
    expect(screen.getByText(/— прошёл/)).toBeInTheDocument();
  });

  it('переключатель «Все проекты» показывает и незакреплённые', async () => {
    render();
    await screen.findByText('Демо');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Все проекты' }));
    expect(await screen.findByText('Без закрепления')).toBeInTheDocument();
  });

  it('фильтр по приоритету', async () => {
    render();
    await screen.findByText('Демо');
    const user = userEvent.setup();
    await user.click(
      within(screen.getByRole('group', { name: 'Фильтр по приоритету' })).getByRole('button', {
        name: 'Высокий',
      }),
    );
    expect(screen.getByText('Сайт')).toBeInTheDocument();
    expect(screen.queryByText('Демо')).not.toBeInTheDocument();
  });

  it('сортировка по приоритету не трогает сохранённый порядок', async () => {
    render();
    await screen.findByText('Демо');
    expect(titles()).toEqual(['Демо', 'Сайт', 'Офелия']);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'По приоритету' }));
    expect(titles()).toEqual(['Сайт', 'Демо', 'Офелия']);
    await user.click(screen.getByRole('button', { name: 'Мой порядок' }));
    expect(titles()).toEqual(['Демо', 'Сайт', 'Офелия']);
    expect(reorders).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('карточка раскрывается и загружает задачи только тогда', async () => {
    render();
    await screen.findByText('Демо');
    expect(taskRequests).toEqual([]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Показать задачи: Демо' }));
    expect(await screen.findByText('Записать дубль')).toBeInTheDocument();
    expect(taskRequests).toEqual(['p-demo']);

    await user.click(screen.getByText('Записать дубль'));
    expect(await screen.findByText('страница задачи')).toBeInTheDocument();
  });

  it('стрелки в режиме порядка сохраняют новый порядок направления', async () => {
    render();
    await screen.findByText('Демо');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Упорядочить' }));
    await user.click(screen.getByRole('button', { name: 'Ниже: Демо' }));
    expect(reorders).toEqual([['p-site', 'p-demo']]);
  });

  it('открепление с карточки', async () => {
    render();
    await screen.findByText('Демо');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Открепить проект: Демо' }));
    expect(updates).toEqual([{ id: 'p-demo', input: { pinned: false } }]);
  });

  it('без закреплённых — объясняет и предлагает все проекты', async () => {
    overviewBehaviour = async (scope) => ({
      stats: { ...stats, pinned: 0 },
      projects: scope === 'pinned' ? [] : [loose],
    });
    render();
    expect(await screen.findByText('Закреплённых проектов пока нет')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Показать все проекты' }));
    expect(await screen.findByText('Без закрепления')).toBeInTheDocument();
  });
});
