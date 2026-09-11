import { beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './render.js';
import { makeFocus } from './fixtures.js';

// jsdom не реализует matchMedia — Shell следит за системной темой через него
beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      reminders: { today: async () => [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] },
      inbox: { list: async () => [] },
      me: async () => null,
      focus: {
        get: async () =>
          makeFocus({ focusDirectionId: null, direction: null, activeTaskId: null, activeTask: null }),
      },
      auth: { logout: async () => ({}) },
    },
  };
});

const { Shell } = await import('../components/Shell.js');

/**
 * Счётчик в листе «Ещё» раньше был голым числом рядом с текстом. Теперь это
 * кружок поверх иконки — проверяем, что он действительно лежит внутри
 * .ic-wrap (а не просто существует где-то на странице).
 */
describe('«Ещё»: счётчик напоминаний — кружок на иконке', () => {
  it('лежит внутри .ic-wrap рядом со значком, а не отдельным числом', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Shell>
        <div>содержимое страницы</div>
      </Shell>,
    );

    await user.click(screen.getByRole('button', { name: /Ещё/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Ещё' });
    const reminderOpt = within(dialog).getByText('Напоминания').closest('button');
    expect(reminderOpt).not.toBeNull();

    const iconWrap = reminderOpt?.querySelector('.ic-wrap');
    expect(iconWrap).not.toBeNull();
    expect(iconWrap?.querySelector('.ct-badge')?.textContent).toBe('3');
  });
});
