import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from './render.js';

const iso = '2026-08-27T09:00:00.000Z';

const settings = {
  userId: 'user-1',
  timezone: 'Europe/Moscow',
  locale: 'ru',
  morningTime: '10:00',
  dayTime: '15:00',
  eveningTime: '21:00',
  missedReminderRepeat: true,
  morningDigestEnabled: true,
  theme: 'system' as const,
  telegramLinked: false,
  updatedAt: iso,
};

const update = vi.fn();

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      settings: { get: async () => settings, update },
      telegram: { status: async () => ({ linked: false }) },
      calendar: { connection: async () => ({ connected: false }), list: async () => [] },
    },
  };
});

const { SettingsPage } = await import('../routes/SettingsPage.js');
const { ApiError } = await import('../api/client.js');

/**
 * Сервер отклоняет неверный порядок слотов понятной ошибкой валидации —
 * интерфейс должен её показать, а не просто промолчать и оставить человека
 * гадать, почему поле не сохранилось.
 */
describe('настройки: ошибка порядка слотов показывается пользователю', () => {
  it('сообщение сервера появляется тостом', async () => {
    update.mockRejectedValueOnce(
      new ApiError(
        'validation',
        'Время слотов должно идти по порядку: утро раньше дня, день раньше вечера',
        400,
      ),
    );
    renderWithProviders(<SettingsPage />, '/settings');
    await screen.findByText('Время и язык');

    const dayInput = screen.getByLabelText('День') as HTMLInputElement;
    fireEvent.change(dayInput, { target: { value: '09:00' } });

    expect(
      await screen.findByText(
        'Время слотов должно идти по порядку: утро раньше дня, день раньше вечера',
      ),
    ).toBeInTheDocument();
  });
});
