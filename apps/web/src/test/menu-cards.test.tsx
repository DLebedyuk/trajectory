import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render.js';

const list = vi.fn(async (_filter?: Record<string, unknown>) => [
  {
    id: 'menu-1',
    userId: 'user-1',
    title: 'Сходить на выставку',
    category: 'другое',
    energy: 'medium',
    estimatedTime: 'hour',
    cost: 'cheap',
    place: 'out',
    company: 'any',
    comment: null,
    link: null,
    tried: false,
    createdAt: '2026-08-27T09:00:00.000Z',
    updatedAt: '2026-08-27T09:00:00.000Z',
  },
]);

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: { menu: { list: (f?: Record<string, unknown>) => list(f) } },
  };
});

const { MenuPage } = await import('../routes/MenuPage.js');

/**
 * Категория возможности почти всегда была «другое» и о самой возможности
 * ничего не говорила. С карточек она убрана; вместо неё появился фильтр по
 * тому, пробовала уже или нет.
 */
describe('меню возможностей', () => {
  it('на карточке нет метки категории', async () => {
    renderWithProviders(<MenuPage />, '/menu');

    await screen.findByText('Сходить на выставку');
    expect(screen.queryByText('другое')).not.toBeInTheDocument();
    expect(document.querySelector('.menu-idea .cat')).toBeNull();
  });

  it('фильтр по попробованности уходит на сервер строкой', async () => {
    list.mockClear();
    renderWithProviders(<MenuPage />, '/menu');
    const user = userEvent.setup();

    await screen.findByText('Сходить на выставку');
    await user.click(screen.getByRole('button', { name: 'ещё нет' }));

    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ tried: 'false' }));
  });

  it('повторный клик по чипу снимает фильтр', async () => {
    list.mockClear();
    renderWithProviders(<MenuPage />, '/menu');
    const user = userEvent.setup();

    await screen.findByText('Сходить на выставку');
    await user.click(screen.getByRole('button', { name: 'уже да' }));
    await user.click(screen.getByRole('button', { name: 'уже да' }));

    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ tried: undefined }));
  });
});
