import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render.js';
import { makeDashboard } from './fixtures.js';

const create = vi.fn(async () => ({}));

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () =>
        makeDashboard({
          today: '2026-08-27',
          heatmap: {
            from: '2026-03-02',
            to: '2026-08-27',
            days: [
              {
                date: '2026-08-26',
                total: 2,
                directions: [{ directionId: 'dir-voice', color: '--d-voice', count: 2 }],
              },
            ],
            weekTotal: 2,
            total: 2,
          },
        }),
      directions: {
        list: async () => [{ id: 'dir-voice', name: 'Озвучка', color: '--d-voice' }],
      },
      touches: {
        byDate: async () => [
          {
            id: 't-1',
            title: 'Записала дубль',
            directionName: 'Озвучка',
            directionColor: '--d-voice',
            projectTitle: null,
            comment: null,
          },
        ],
        create,
      },
      projects: { listByDirection: async () => [] },
    },
  };
});

const { HomePage } = await import('../routes/HomePage.js');

/**
 * Раньше на карте касаний кликался только заполненный день. Пустой день
 * должен сразу открывать запись касания с предзаполненной датой, а не быть
 * неактивным — и из карточки уже заполненного дня тоже можно добавить ещё
 * одно касание, не закрывая и не переоткрывая всё заново.
 */
describe('главная: клик по карте касаний', () => {
  it('пустой день открывает запись касания с этой датой', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HomePage />, '/');
    await screen.findByText('Касания по всем направлениям');

    await user.click(screen.getByRole('button', { name: '2026-08-20: пусто' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Записать касание' })).toBeInTheDocument();
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput.value).toBe('2026-08-20');
  });

  it('заполненный день открывает список, откуда тоже можно записать касание', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HomePage />, '/');
    await screen.findByText('Касания по всем направлениям');

    await user.click(screen.getByRole('button', { name: '2026-08-26: 2 касаний' }));
    expect(await screen.findByText('Записала дубль')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Записать касание' }));
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput.value).toBe('2026-08-26');
  });
});
