import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render.js';
import { makeTask } from './fixtures.js';

/**
 * Поведение задаётся обычной функцией, а не vi.fn: обёртка мока подписывается
 * на возвращённый промис и делает отклонение «необработанным», из-за чего
 * тест на ошибку падает мимо собственных проверок.
 */
let listBehaviour: () => Promise<unknown> = async () => [];
const reopened: string[] = [];

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      ...actual.api,
      dashboard: async () => ({ today: '2026-08-29' }),
      projects: { get: async () => ({ id: 'proj-1', title: 'Подготовить монолог Офелии' }) },
      tasks: {
        listByProject: () => listBehaviour(),
        reopen: async (id: string) => {
          reopened.push(id);
          return {};
        },
      },
    },
  };
});

const { ProjectArchivePage } = await import('../routes/ArchivePage.js');

const doneTask = makeTask({
  id: 'done-1',
  title: 'Выбрать редакцию перевода',
  status: 'done',
  completedAt: '2026-08-27T10:00:00.000Z',
});

function render() {
  return renderWithProviders(
    <Routes>
      <Route path="/projects/:projectId/archive" element={<ProjectArchivePage />} />
    </Routes>,
    '/projects/proj-1/archive',
  );
}

describe('архив проекта', () => {
  beforeEach(() => {
    reopened.length = 0;
    listBehaviour = async () => [doneTask];
  });

  it('показывает завершённые задачи проекта', async () => {
    render();
    expect(await screen.findByText('Выбрать редакцию перевода')).toBeInTheDocument();
  });

  it('пустой архив объясняет себя', async () => {
    listBehaviour = async () => [];
    render();
    expect(await screen.findByText(/пока ничего не завершено/i)).toBeInTheDocument();
  });

  it('при ошибке предлагает повторить', async () => {
    listBehaviour = () => Promise.reject(new Error('сеть недоступна'));
    render();
    expect(await screen.findByRole('button', { name: /повторить/i })).toBeInTheDocument();
  });

  it('возвращает задачу в работу', async () => {
    render();
    await screen.findByText('Выбрать редакцию перевода');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Вернуть' }));
    expect(reopened).toEqual(['done-1']);
  });
});
