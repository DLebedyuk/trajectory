import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const update = vi.fn(async (patch: Partial<typeof settings>) => ({ ...settings, ...patch }));

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

/**
 * Раздел «Сегодня» в утреннем сообщении — новая возможность, отдельная
 * галочка позволяет выключить именно её, не трогая обычные напоминания.
 */
describe('настройки: галочка сводки дня в утреннем сообщении', () => {
  it('отражает текущее состояние и переключает его по клику', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />, '/settings');
    await screen.findByText('Сводка дня в утреннем сообщении');

    const toggle = screen.getByRole('switch', { name: 'Сводка дня в утреннем сообщении' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    expect(update).toHaveBeenCalledWith({ morningDigestEnabled: false });
  });
});
