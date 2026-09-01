import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { renderWithProviders } from './render.js';
import { makeDashboard, makeFocus } from './fixtures.js';

const direction = {
  id: 'dir-act',
  userId: 'user-1',
  name: 'Актёрство',
  description: null,
  color: '--d-act',
  icon: 'mask',
  motto: null,
  showMotto: false,
  notes: [],
  sortOrder: 0,
  archivedAt: null,
  createdAt: '2026-08-27T09:00:00.000Z',
  updatedAt: '2026-08-27T09:00:00.000Z',
  touchCount: 3,
  lastTouchDate: '2026-08-26',
};

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () => makeDashboard({ focus: makeFocus({ focusDirectionId: null }) }),
      directions: { list: async () => [direction] },
      touches: {
        heatmap: async () => ({
          days: [{ date: '2026-08-26', total: 2, directions: [] }],
          total: 3,
          weekTotal: 1,
        }),
      },
      tasks: {
        pinned: async () => [
          {
            id: 'task-9',
            title: 'Разобрать монолог',
            projectTitle: 'Показ',
            deadline: null,
            estimatedDuration: 'short',
          },
        ],
      },
    },
  };
});

const { DirectionsPage } = await import('../routes/DirectionsPage.js');

const renderList = () =>
  renderWithProviders(
    <Routes>
      <Route path="/directions" element={<DirectionsPage />} />
      <Route path="/directions/:directionId" element={<div>страница направления</div>} />
      <Route path="/directions/:directionId/touches" element={<div>все касания</div>} />
      <Route path="/tasks/:taskId" element={<div>страница задачи</div>} />
    </Routes>,
    '/directions',
  );

/**
 * Клик по плашке направления открывал «все касания» — потому что карта
 * касаний была отдельной кнопкой со своим маршрутом. Плашка воспринимается
 * как одна карточка, значит и вести должна в одно место.
 */
describe('список направлений: куда ведёт клик', () => {
  it('клик по карте касаний открывает направление, а не список всех касаний', async () => {
    renderList();
    const user = userEvent.setup();

    await screen.findByText('Актёрство');
    const map = document.querySelector('.dir-list-row .map-cell');
    expect(map).not.toBeNull();
    await user.click(map as Element);

    expect(await screen.findByText('страница направления')).toBeInTheDocument();
    expect(screen.queryByText('все касания')).not.toBeInTheDocument();
  });

  it('клик по пустому месту плашки тоже открывает направление', async () => {
    renderList();
    const user = userEvent.setup();

    await screen.findByText('Актёрство');
    await user.click(document.querySelector('.dir-list-row') as Element);

    expect(await screen.findByText('страница направления')).toBeInTheDocument();
  });

  it('закреплённая задача внутри плашки по-прежнему ведёт к себе', async () => {
    renderList();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Разобрать монолог/ }));

    expect(await screen.findByText('страница задачи')).toBeInTheDocument();
    expect(screen.queryByText('страница направления')).not.toBeInTheDocument();
  });
});
