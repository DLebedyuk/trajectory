import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render.js';

const createCategory = vi.fn(async (name: string) => ({
  id: 'cat-new',
  userId: 'u1',
  name,
  sortOrder: 2,
}));
const createItem = vi.fn(async (_input: Record<string, unknown>) => ({}));

const book = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  userId: 'u1',
  kind: 'book',
  title: 'Внутренняя игра в теннис',
  authorOrDirector: 'Тимоти Голви',
  categoryId: null,
  categoryName: null,
  coverUrl: null,
  coverEmoji: '📗',
  pinned: false,
  comment: null,
  link: null,
  startedAt: null,
  status: 'want',
  rating: 0,
  createdAt: '2026-08-27T09:00:00.000Z',
  updatedAt: '2026-08-27T09:00:00.000Z',
  ...over,
});

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      media: {
        list: async () => [
          book(),
          book({ id: 'm2', title: 'Краткая история времени', categoryId: 'cat-1' }),
        ],
        categories: async () => [{ id: 'cat-1', userId: 'u1', name: 'научпоп', sortOrder: 0 }],
        createCategory: (name: string) => createCategory(name),
        create: (input: Record<string, unknown>) => createItem(input),
        pin: async () => ({}),
        unpin: async () => ({}),
        update: async () => ({}),
      },
    },
  };
});

const { MediaPage } = await import('../routes/MediaPage.js');

/**
 * Жанр показывался только тогда, когда он уже кому-то проставлен, а завести
 * новый было неоткуда: ручка в API была, интерфейса — нет. Пустая полка так
 * и оставалась без всякого разделения.
 */
describe('жанры на полке', () => {
  it('фильтр по жанру виден, даже если книга без жанра', async () => {
    renderWithProviders(<MediaPage />, '/media');

    await screen.findByText('Внутренняя игра в теннис');
    expect(screen.getByText('Жанр')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'научпоп' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'без жанра' })).toBeInTheDocument();
  });

  it('фильтр по жанру оставляет только его книги', async () => {
    renderWithProviders(<MediaPage />, '/media');
    const user = userEvent.setup();

    await screen.findByText('Внутренняя игра в теннис');
    await user.click(screen.getByRole('button', { name: 'научпоп' }));

    expect(screen.getByText('Краткая история времени')).toBeInTheDocument();
    expect(screen.queryByText('Внутренняя игра в теннис')).not.toBeInTheDocument();
  });

  it('счётчики вкладок считают только выбранный жанр', async () => {
    renderWithProviders(<MediaPage />, '/media');
    const user = userEvent.setup();

    await screen.findByText('Внутренняя игра в теннис');
    const allTab = () => screen.getByRole('tab', { name: /Всё/ });
    expect(allTab().textContent).toContain('2');

    await user.click(screen.getByRole('button', { name: 'научпоп' }));
    // вкладка обещала «Всё 2», а под ней лежала одна книга
    expect(allTab().textContent).toContain('1');
  });

  it('«без жанра» показывает то, чему жанр не проставлен', async () => {
    renderWithProviders(<MediaPage />, '/media');
    const user = userEvent.setup();

    await screen.findByText('Внутренняя игра в теннис');
    await user.click(screen.getByRole('button', { name: 'без жанра' }));

    expect(screen.getByText('Внутренняя игра в теннис')).toBeInTheDocument();
    expect(screen.queryByText('Краткая история времени')).not.toBeInTheDocument();
  });

  it('новый жанр заводится прямо в форме добавления', async () => {
    createCategory.mockClear();
    createItem.mockClear();
    renderWithProviders(<MediaPage />, '/media');
    const user = userEvent.setup();

    await screen.findByText('Внутренняя игра в теннис');
    await user.click(screen.getByRole('button', { name: /Книга/ }));
    await user.type(await screen.findByLabelText('Название'), 'Мастер и Маргарита');
    await user.selectOptions(screen.getByLabelText('Жанр'), 'new');
    await user.type(await screen.findByLabelText('Название жанра'), 'классика');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    expect(createCategory).toHaveBeenCalledWith('классика');
    expect(createItem.mock.calls.at(-1)?.[0]).toMatchObject({ categoryId: 'cat-new' });
  });
});
