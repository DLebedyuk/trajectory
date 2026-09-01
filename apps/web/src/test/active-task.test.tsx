import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render.js';
import { makeDashboard, makeFocus } from './fixtures.js';

const activate = vi.fn();
const dashboard = vi.fn();

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: () => dashboard(),
      directions: { list: async () => [] },
      projects: { listByDirection: async () => [] },
      reminders: { archive: async () => [], complete: async () => ({}) },
      inbox: { create: async () => ({}) },
      focus: {
        clearActiveTask: async () => makeFocus({ activeTaskId: null, activeTask: null }),
        setDirection: async () => makeFocus(),
      },
      tasks: {
        activate: (id: string) => activate(id),
        complete: async () => ({}),
        pin: async () => ({}),
        unpin: async () => ({}),
        listByProject: async () => [],
        pinned: async () => [],
      },
      media: { pinned: async () => [] },
      touches: { heatmap: async () => ({ days: [] }) },
    },
  };
});

const { HomePage } = await import('../routes/HomePage.js');

describe('выбор активной задачи', () => {
  beforeEach(() => {
    activate.mockReset();
    dashboard.mockReset();
  });

  it('показывает активную задачу связкой направление → проект → задача', async () => {
    dashboard.mockResolvedValue(makeDashboard());
    renderWithProviders(<HomePage />);

    await screen.findByText('Записать блок narration');
    expect(screen.getAllByText('Озвучка').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Подготовить демо для сайта').length).toBeGreaterThan(0);
    // связка направление → проект → задача видна целиком, без служебной подписи
    expect(screen.getByText('активная')).toBeInTheDocument();
  });

  it('не дублирует активную задачу на главной', async () => {
    dashboard.mockResolvedValue(makeDashboard());
    renderWithProviders(<HomePage />);

    await screen.findByText('Записать блок narration');
    // активная задача встречается ровно один раз — только в блоке фокуса
    expect(screen.getAllByText('Записать блок narration')).toHaveLength(1);
  });

  it('состояние «без фокуса» не выглядит ошибкой', async () => {
    dashboard.mockResolvedValue(
      makeDashboard({
        focus: makeFocus({
          focusDirectionId: null,
          direction: null,
          activeTaskId: null,
          activeTask: null,
        }),
      }),
    );
    renderWithProviders(<HomePage />);

    expect(await screen.findByText('Сейчас без фокуса')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выбрать направление' })).toBeInTheDocument();
  });

  it('«Убрать активную» очищает активную задачу', async () => {
    dashboard.mockResolvedValue(makeDashboard());
    renderWithProviders(<HomePage />);
    const user = userEvent.setup();

    await screen.findByText('Записать блок narration');
    // редкое действие живёт в «···», но остаётся доступным и отличным
    // от «Очистить фокус»: это разные операции
    await user.click(screen.getByRole('button', { name: 'Ещё действия' }));
    await user.click(await screen.findByText('Убрать активную задачу'));

    await waitFor(() => expect(dashboard).toHaveBeenCalledTimes(2));
  });
});
