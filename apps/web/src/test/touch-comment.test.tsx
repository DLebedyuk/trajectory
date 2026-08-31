import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './render.js';

/**
 * Комментарий к касанию сохранялся в базу и возвращался API, но во всём
 * интерфейсе не было ни одного места, где он рисуется. Со стороны это
 * выглядело как «комментарий никуда не сохраняется».
 */
const TOUCHES = [
  {
    id: 't1',
    userId: 'u1',
    directionId: 'd1',
    projectId: null,
    date: '2026-08-30',
    title: 'Разбирала монолог по кускам',
    comment: 'Третий кусок пока не ложится, вернуться к нему',
    createdAt: '2026-08-30T10:00:00.000Z',
    directionName: 'Актёрство',
    directionColor: '--c1',
    projectTitle: null,
  },
  {
    id: 't2',
    userId: 'u1',
    directionId: 'd1',
    projectId: null,
    date: '2026-08-29',
    title: 'Распевка',
    comment: null,
    createdAt: '2026-08-29T10:00:00.000Z',
    directionName: 'Актёрство',
    directionColor: '--c1',
    projectTitle: null,
  },
];

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      ...actual.api,
      dashboard: async () => ({ today: '2026-08-31' }),
      directions: {
        list: async () => [],
        get: async () => ({ id: 'd1', name: 'Актёрство', color: '--c1' }),
      },
      projects: { listByDirection: async () => [] },
      touches: {
        list: async () => TOUCHES,
        remove: async () => ({ ok: true }),
      },
    },
  };
});

const { TouchesPage } = await import('../routes/TouchesPage.js');

describe('страница всех касаний', () => {
  it('показывает комментарий касания, а не только заголовок', async () => {
    renderWithProviders(<TouchesPage />, '/touches');

    expect(await screen.findByText('Разбирала монолог по кускам')).toBeInTheDocument();
    expect(
      await screen.findByText('Третий кусок пока не ложится, вернуться к нему'),
    ).toBeInTheDocument();
  });

  it('группирует касания по дням', async () => {
    renderWithProviders(<TouchesPage />, '/touches');

    expect(await screen.findByText('Распевка')).toBeInTheDocument();
    // два разных дня — два заголовка с датой
    expect(screen.getByText(/30 августа/i)).toBeInTheDocument();
    expect(screen.getByText(/29 августа/i)).toBeInTheDocument();
  });
});
