import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from './render.js';
import { makeDashboard, makeFocus } from './fixtures.js';

const update = vi.fn(async () => direction);

const direction = {
  id: 'dir-act',
  userId: 'user-1',
  name: 'Актёрство',
  description: null,
  color: '--d-act',
  icon: 'mask',
  motto: null,
  showMotto: false,
  notes: ['педагог просил разобрать дыхание'],
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
      dashboard: async () => makeDashboard({ focus: makeFocus({ focusDirectionId: null }) }),
      directions: {
        get: async () => direction,
        list: async () => [],
        update: (id: string, input: unknown) => update(id as never, input as never),
      },
      projects: { listByDirection: async () => [] },
      touches: { list: async () => [], heatmap: async () => ({ days: [], total: 0 }) },
    },
  };
});

const { DirectionPage } = await import('../routes/DirectionPage.js');

const renderPage = () =>
  renderWithProviders(
    <Routes>
      <Route path="/directions/:directionId" element={<DirectionPage />} />
    </Routes>,
    '/directions/dir-act',
  );

/**
 * Заметки нужны не только проекту: часть записей относится ко всему
 * направлению и раньше их некуда было положить.
 */
describe('заметки направления', () => {
  it('показывает существующие заметки рядом с проектами', async () => {
    renderPage();
    expect(await screen.findByText('педагог просил разобрать дыхание')).toBeInTheDocument();
  });

  it('новая заметка уходит в направление, а не в проект', async () => {
    update.mockClear();
    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Актёрство');
    await user.click(screen.getByRole('button', { name: /Заметка/ }));
    await user.type(await screen.findByLabelText('Текст'), 'купить пьесу');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(update).toHaveBeenCalledWith('dir-act', {
      notes: ['педагог просил разобрать дыхание', 'купить пьесу'],
    });
  });
});
