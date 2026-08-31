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
const doneByDirection = (): Promise<unknown> => archiveBehaviour();

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
      ...actual.api,
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
const { DirectionArchivePage } = await import('../routes/ArchivePage.js');

function renderDirection() {
  return renderWithProviders(
    <Routes>
      <Route path="/directions/:directionId" element={<DirectionPage />} />
    </Routes>,
    '/directions/dir-act',
  );
}

function renderArchive() {
  return renderWithProviders(
    <Routes>
      <Route path="/directions/:directionId/archive" element={<DirectionArchivePage />} />
    </Routes>,
    '/directions/dir-act/archive',
  );
}

describe('страница направления', () => {
  beforeEach(() => {
    archiveBehaviour = async () => [];
  });

  it('не показывает девиз направления', async () => {
    renderDirection();
    await screen.findByText('Актёрство');
    expect(screen.queryByText(/Легаси-девиз/)).not.toBeInTheDocument();
  });

  it('архив открывается ссылкой, а не модалкой', async () => {
    renderDirection();
    await screen.findByText('Актёрство');
    expect(screen.getByRole('button', { name: 'Архив' })).toBeInTheDocument();
    // модалки на странице больше нет: содержимое живёт на своей странице
    expect(screen.queryByText(/Архив направления/)).not.toBeInTheDocument();
  });
});

describe('страница архива направления', () => {
  beforeEach(() => {
    archiveBehaviour = async () => [];
  });

  it('показывает завершённые задачи с названием проекта', async () => {
    archiveBehaviour = async () => [
      makeTask({
        id: 'done-1',
        title: 'Выбрать редакцию перевода',
        status: 'done',
        completedAt: '2026-08-25T10:00:00.000Z',
        projectTitle: 'Подготовить монолог Офелии',
      }),
    ];
    renderArchive();

    expect(await screen.findByText('Выбрать редакцию перевода')).toBeInTheDocument();
    expect(screen.getByText('Подготовить монолог Офелии')).toBeInTheDocument();
  });

  it('у пустого архива понятное состояние, а не пустота', async () => {
    renderArchive();
    expect(await screen.findByText(/Пока ничего не завершено/i)).toBeInTheDocument();
  });

  it('при ошибке предлагает повторить, а не молчит', async () => {
    archiveBehaviour = () => Promise.reject(new Error('сеть недоступна'));
    renderArchive();
    expect(await screen.findByRole('button', { name: /повторить/i })).toBeInTheDocument();
  });

  it('открывается повторно без поломок', async () => {
    archiveBehaviour = async () => [
      makeTask({ id: 'done-1', title: 'Выбрать редакцию перевода', status: 'done' }),
    ];
    const first = renderArchive();
    expect(await screen.findByText('Выбрать редакцию перевода')).toBeInTheDocument();
    first.unmount();

    renderArchive();
    expect(await screen.findByText('Выбрать редакцию перевода')).toBeInTheDocument();
  });
});

// на странице архива нет действий, кроме перехода к задаче — клики проверяются
// в архиве проекта, где есть «Вернуть»
void userEvent;
