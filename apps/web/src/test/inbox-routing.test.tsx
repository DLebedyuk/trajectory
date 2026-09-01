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
  originalText: 'собрать портфолио для озвучки',
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
      directions: {
        list: async () => [
          { id: 'dir-voice', name: 'Озвучка', color: '--d-voice' },
          { id: 'dir-act', name: 'Актёрство', color: '--d-act' },
        ],
      },
      projects: {
        listByDirection: async (directionId: string) =>
          directionId === 'dir-voice'
            ? [{ id: 'p1', title: 'Демо для сайта', directionId, status: 'active' }]
            : [],
      },
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
 * Проект из входящих заводился в первом попавшемся направлении, а тип
 * «заметка в проект» растворял запись в чужих заметках. Направление теперь
 * выбирает человек, заметки как типа больше нет.
 */
describe('разбор входящих', () => {
  it('нет типа «заметка в проект»', async () => {
    renderWithProviders(<InboxPage />, '/inbox');

    await screen.findByText(ITEM.originalText);
    expect(screen.queryByRole('button', { name: 'Заметка в проект' })).not.toBeInTheDocument();
  });

  it('для проекта спрашивает направление и отправляет его', async () => {
    applied.mockClear();
    renderWithProviders(<InboxPage />, '/inbox');
    const user = userEvent.setup();

    await screen.findByText(ITEM.originalText);
    await user.click(screen.getByRole('button', { name: 'Проект' }));

    const select = await screen.findByLabelText('Направление — в нём заведётся проект');
    await user.selectOptions(select, 'dir-act');
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(applied.mock.calls.at(-1)?.[0][0]).toMatchObject({
      type: 'project',
      directionId: 'dir-act',
    });
  });

  it('для напоминания можно указать время', async () => {
    applied.mockClear();
    renderWithProviders(<InboxPage />, '/inbox');
    const user = userEvent.setup();

    await screen.findByText(ITEM.originalText);
    await user.click(screen.getByRole('button', { name: 'Напоминание' }));

    await user.type(await screen.findByLabelText('Когда напомнить'), '2026-12-01');
    await user.type(screen.getByLabelText('Во сколько — если время важно'), '10:30');
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(applied.mock.calls.at(-1)?.[0][0]).toMatchObject({
      type: 'reminder',
      remindAt: '2026-12-01',
      remindTime: '10:30',
    });
  });

  it('у задачи по-прежнему спрашивается проект, а не направление', async () => {
    renderWithProviders(<InboxPage />, '/inbox');
    const user = userEvent.setup();

    await screen.findByText(ITEM.originalText);
    await user.click(screen.getByRole('button', { name: 'Задача' }));

    expect(await screen.findByLabelText('Проект — определяет направление')).toBeInTheDocument();
    expect(screen.queryByLabelText('Направление — в нём заведётся проект')).not.toBeInTheDocument();
  });
});
