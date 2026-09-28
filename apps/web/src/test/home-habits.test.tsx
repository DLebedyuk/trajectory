import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render.js';
import { makeDashboard } from './fixtures.js';

const habitsList = vi.fn();

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () => makeDashboard({ today: '2026-09-29' }),
      directions: {
        list: async () => [{ id: 'dir-vocal', name: 'Вокал', color: '--d-vocal' }],
      },
      habits: { list: () => habitsList() },
      projects: { listByDirection: async () => [] },
    },
  };
});

const { HomePage } = await import('../routes/HomePage.js');

/**
 * «Когда есть время» — привычки со всех направлений на главной. Не задачи:
 * ни галочек, ни сроков. Клик — это «я этим занялась», то есть касание.
 */
describe('главная: привычки', () => {
  it('клик по привычке открывает запись касания с её направлением и названием', async () => {
    habitsList.mockResolvedValue([
      {
        id: 'h-1',
        directionId: 'dir-vocal',
        title: 'Попеть за пианино',
        sortOrder: 0,
        createdAt: '2026-09-29T10:00:00.000Z',
        directionName: 'Вокал',
        directionColor: '--d-vocal',
      },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<HomePage />, '/');

    const card = await screen.findByRole('region', { name: 'Когда есть время' });
    await user.click(await within(card).findByRole('button', { name: /Попеть за пианино/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('Попеть за пианино')).toBeInTheDocument();
    expect((document.querySelector('input[type="date"]') as HTMLInputElement).value).toBe(
      '2026-09-29',
    );
  });

  it('без привычек карточка подсказывает, где их добавить', async () => {
    habitsList.mockResolvedValue([]);
    renderWithProviders(<HomePage />, '/');

    const card = await screen.findByRole('region', { name: 'Когда есть время' });
    expect(await within(card).findByText(/Добавляются на странице направления/)).toBeInTheDocument();
  });
});
