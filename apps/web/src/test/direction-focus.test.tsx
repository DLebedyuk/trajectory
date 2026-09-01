import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from './render.js';
import { makeDashboard, makeFocus } from './fixtures.js';

const setDirection = vi.fn();

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
};

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () => makeDashboard({ focus: makeFocus({ focusDirectionId: 'dir-voice' }) }),
      directions: { get: async () => direction, list: async () => [] },
      projects: { listByDirection: async () => [] },
      touches: { list: async () => [], heatmap: async () => ({ days: [], total: 0 }) },
      focus: { setDirection: (id: string | null, mode: string) => setDirection(id, mode) },
    },
  };
});

const { ApiError } = await import('../api/client.js');
const { DirectionPage } = await import('../routes/DirectionPage.js');

/**
 * Кнопка «В фокус» на странице направления не имеет права молча снять
 * активную задачу из другого направления — выбор делает пользователь.
 */
describe('фокус со страницы направления', () => {
  beforeEach(() => setDirection.mockReset());

  it('при конфликте показывает диалог с тремя вариантами, а не очищает задачу молча', async () => {
    setDirection.mockRejectedValueOnce(
      new ApiError('focus_direction_conflict', 'Активная задача из другого направления', 409, {
        activeTaskTitle: 'Записать блок narration',
        activeTaskDirectionName: 'Озвучка',
        requestedDirectionId: 'dir-act',
        requestedDirectionName: 'Актёрство',
      }),
    );
    renderWithProviders(
      <Routes>
        <Route path="/directions/:directionId" element={<DirectionPage />} />
      </Routes>,
      '/directions/dir-act',
    );
    const user = userEvent.setup();

    await screen.findByText('Актёрство');
    await user.click(screen.getByRole('button', { name: 'Поставить в фокус' }));

    expect(setDirection).toHaveBeenCalledWith('dir-act', 'ask');
    expect(await screen.findByText('Активная задача из другого направления')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Оставить задачу' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сменить направление' })).toBeInTheDocument();
    expect(setDirection).toHaveBeenCalledTimes(1);
  });

  it('выбор «Сменить направление» доводит операцию до конца', async () => {
    setDirection
      .mockRejectedValueOnce(
        new ApiError('focus_direction_conflict', 'Конфликт', 409, {
          activeTaskTitle: 'Записать блок narration',
          activeTaskDirectionName: 'Озвучка',
          requestedDirectionId: 'dir-act',
          requestedDirectionName: 'Актёрство',
        }),
      )
      .mockResolvedValueOnce(makeFocus({ focusDirectionId: 'dir-act', activeTaskId: null }));

    renderWithProviders(
      <Routes>
        <Route path="/directions/:directionId" element={<DirectionPage />} />
      </Routes>,
      '/directions/dir-act',
    );
    const user = userEvent.setup();

    await screen.findByText('Актёрство');
    await user.click(screen.getByRole('button', { name: 'Поставить в фокус' }));
    await user.click(await screen.findByRole('button', { name: 'Сменить направление' }));

    expect(setDirection).toHaveBeenLastCalledWith('dir-act', 'clearTask');
  });
});
