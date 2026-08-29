import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render.js';
import { makeDashboard, makeFocus, makeTask } from './fixtures.js';

/**
 * Поведение архива задаёт обычная функция, а не vi.fn: обёртка мока
 * подписывается на возвращённый промис и делает отклонение «необработанным»,
 * из-за чего тест на ошибку падает мимо собственных проверок.
 */
let archiveBehaviour: () => Promise<unknown> = async () => [];
let archiveCalls = 0;
const doneByDirection = (): Promise<unknown> => {
  archiveCalls += 1;
  return archiveBehaviour();
};

const direction = {
  id: 'dir-act',
  userId: 'user-1',
  name: 'Актёрство',
  description: 'Роли и самопробы',
  color: '--d-act',
  icon: 'mask',
  motto: 'Легаси-девиз, которого не должно быть видно',
  showMotto: true,
  sortOrder: 0,
  archivedAt: null,
  createdAt: '2026-08-27T09:00:00.000Z',
  updatedAt: '2026-08-27T09:00:00.000Z',
};

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () => makeDashboard({ focus: makeFocus() }),
      directions: { get: async () => direction, list: async () => [] },
      projects: { listByDirection: async () => [] },
      touches: { list: async () => [], heatmap: async () => ({ days: [], total: 0 }) },
      focus: { setDirection: async () => makeFocus() },
      tasks: { doneByDirection: () => doneByDirection() },
    },
  };
});

const { DirectionPage } = await import('../routes/DirectionPage.js');

function render() {
  return renderWithProviders(
    <Routes>
      <Route path="/directions/:directionId" element={<DirectionPage />} />
    </Routes>,
    '/directions/dir-act',
  );
}

describe('страница направления', () => {
  beforeEach(() => {
    archiveCalls = 0;
    archiveBehaviour = async () => [];
  });

  it('не показывает девиз направления', async () => {
    render();
    await screen.findByText('Актёрство');
    expect(screen.queryByText(/Легаси-девиз/)).not.toBeInTheDocument();
  });

  it('архив показывает завершённые задачи с названием проекта', async () => {
    archiveBehaviour = async () => [
      makeTask({
        id: 'done-1',
        title: 'Выбрать редакцию перевода',
        status: 'done',
        completedAt: '2026-08-25T10:00:00.000Z',
        projectTitle: 'Подготовить монолог Офелии',
      }),
    ];
    render();
    const user = userEvent.setup();

    await screen.findByText('Актёрство');
    await user.click(screen.getByRole('button', { name: 'Архив' }));

    expect(await screen.findByText('Выбрать редакцию перевода')).toBeInTheDocument();
    expect(screen.getByText('Подготовить монолог Офелии')).toBeInTheDocument();
  });

  it('у пустого архива понятное состояние, а не пустота', async () => {
    render();
    const user = userEvent.setup();

    await screen.findByText('Актёрство');
    await user.click(screen.getByRole('button', { name: 'Архив' }));

    expect(await screen.findByText(/Здесь появятся завершённые задачи/)).toBeInTheDocument();
  });

  it('при ошибке предлагает повторить, а не молчит', async () => {
    archiveBehaviour = () => Promise.reject(new Error('сеть недоступна'));
    render();
    const user = userEvent.setup();

    await screen.findByText('Актёрство');
    await user.click(screen.getByRole('button', { name: 'Архив' }));

    expect(await screen.findByText('Не удалось загрузить архив.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('архив запрашивается только при открытии', async () => {
    render();
    await screen.findByText('Актёрство');
    expect(archiveCalls).toBe(0);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Архив' }));
    await screen.findByText(/Здесь появятся завершённые задачи/);
    expect(archiveCalls).toBe(1);
  });
});
