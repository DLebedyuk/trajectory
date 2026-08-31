import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render.js';

const applied = vi.fn(async (_proposals: Record<string, unknown>[]) => ({
  applied: 1,
  skipped: [] as unknown[],
}));

const ITEM = {
  id: 'i1',
  userId: 'u1',
  originalText: 'сходить на выставку Врубеля',
  source: 'web',
  status: 'new',
  proposedType: null,
  createdAt: '2026-08-30T10:00:00.000Z',
  processedAt: null,
};

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      ...actual.api,
      directions: { list: async () => [] },
      projects: { listByDirection: async () => [] },
      inbox: {
        list: async () => [ITEM],
        apply: (proposals: unknown) => applied(proposals as never),
        propose: async () => [],
        create: async () => ({}),
        remove: async () => ({ ok: true }),
      },
    },
  };
});

const { InboxPage } = await import('../routes/InboxPage.js');

/**
 * При выборе «Идея меню» параметры должны быть на виду и редактируемы.
 * Раньше их не было вовсе, и база молча подставляла свои значения.
 */
describe('идея меню во входящих', () => {
  it('показывает категорию и четыре параметра', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InboxPage />);

    await screen.findByText(ITEM.originalText);
    // тип выбирается чипом, а не выпадающим списком
    await user.click(screen.getByRole('button', { name: 'Идея меню' }));

    expect(screen.getByText('Категория')).toBeInTheDocument();
    expect(screen.getByText('Энергия')).toBeInTheDocument();
    expect(screen.getByText('Время')).toBeInTheDocument();
    expect(screen.getByText('Стоимость')).toBeInTheDocument();
    expect(screen.getByText('Место')).toBeInTheDocument();
  });

  it('отправляет выбранные параметры, а не пустоту', async () => {
    const user = userEvent.setup();
    renderWithProviders(<InboxPage />);

    await screen.findByText(ITEM.originalText);
    await user.click(screen.getByRole('button', { name: 'Идея меню' }));

    const selects = screen.getAllByRole('combobox');
    // порядок селекторов меню: энергия, время, стоимость, место
    await user.selectOptions(selects[0]!, 'low');
    await user.selectOptions(selects[2]!, 'budget');
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(applied).toHaveBeenCalled();
    const sent = applied.mock.calls.at(-1)?.[0] ?? [];
    expect(sent[0]?.type).toBe('menu');
    expect(sent[0]?.energy).toBe('low');
    expect(sent[0]?.cost).toBe('budget');
    expect(sent[0]?.menuCategory).toBe('другое');
  });
});
