import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreateReminderInput, Reminder } from '@planner/contracts';
import { renderWithProviders } from './render.js';
import { makeDashboard } from './fixtures.js';

const iso = '2026-08-27T09:00:00.000Z';
const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: 'r-1',
  userId: 'user-1',
  text: 'Развесить бельё',
  scheduledDate: '2026-08-27',
  scheduledTime: null,
  timeSlot: null,
  timezone: 'Europe/Moscow',
  deliveryMode: 'digest',
  repeatRule: null,
  notify: false,
  sortOrder: 0,
  source: 'web',
  comment: null,
  status: 'active',
  createdAt: iso,
  closedAt: null,
  updatedAt: iso,
  ...over,
});

let list: Reminder[];
let archived: Reminder[];
const created: CreateReminderInput[] = [];
const reopened: string[] = [];

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    api: {
      dashboard: async () => makeDashboard({ today: '2026-08-27' }),
      directions: { list: async () => [] },
      settings: { get: async () => ({ timezone: 'Europe/Moscow' }) },
      reminders: {
        list: async () => list,
        archive: async () => archived,
        create: async (input: CreateReminderInput) => {
          created.push(input);
          return reminder({ ...input, id: 'r-new' } as Partial<Reminder>);
        },
        reopen: async (id: string) => {
          reopened.push(id);
          return reminder({ id });
        },
      },
    },
  };
});

const { RemindersPage } = await import('../routes/RemindersPage.js');

describe('ежедневный список в напоминаниях', () => {
  beforeEach(() => {
    created.length = 0;
    reopened.length = 0;
    list = [
      reminder({ id: 'r-old', text: 'Забрать посылку', scheduledDate: '2026-08-25' }),
      reminder({ id: 'r-1' }),
    ];
    archived = [
      reminder({
        id: 'r-done',
        text: 'Убрать вещи',
        status: 'done',
        // 23:30 по Москве 27-го — это всё ещё «сегодня», хотя в UTC уже 20:30
        closedAt: '2026-08-27T20:30:00.000Z',
      }),
      reminder({
        id: 'r-yesterday',
        text: 'Полить растения',
        status: 'done',
        closedAt: '2026-08-26T10:00:00.000Z',
      }),
    ];
  });

  it('Enter записывает дело на сегодня без уведомления — больше ничего не спрашивая', async () => {
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Развесить бельё');
    await userEvent
      .setup()
      .type(screen.getByRole('textbox', { name: 'Новое дело' }), 'Позвонить{Enter}');
    expect(created).toEqual([
      {
        text: 'Позвонить',
        scheduledDate: '2026-08-27',
        notify: false,
        scheduledTime: null,
        timeSlot: null,
        source: 'web',
      },
    ]);
  });

  it('пункты пачкой: второй Enter, пока первый сохраняется, не теряется', async () => {
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Развесить бельё');
    const input = screen.getByRole('textbox', { name: 'Новое дело' });
    await userEvent.setup().type(input, 'Позвонить{Enter}Забрать посылку{Enter}');
    expect(created.map((c) => c.text)).toEqual(['Позвонить', 'Забрать посылку']);
    expect(input).toHaveValue('');
  });

  it('дата и напоминание открываются только по запросу', async () => {
    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Развесить бельё');
    expect(screen.queryByRole('checkbox', { name: 'Напомнить' })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Дата и напоминание' }));
    await user.click(screen.getByRole('button', { name: 'Завтра' }));
    await user.click(screen.getByRole('checkbox', { name: 'Напомнить' }));
    await user.click(screen.getByRole('button', { name: 'Вечер' }));
    await user.type(screen.getByRole('textbox', { name: 'Новое дело' }), 'Позвонить маме{Enter}');
    expect(created[0]).toMatchObject({
      scheduledDate: '2026-08-28',
      notify: true,
      timeSlot: 'evening',
    });
  });

  it('просроченное остаётся в «Сегодня» со своей датой', async () => {
    renderWithProviders(<RemindersPage />, '/reminders');
    expect(await screen.findByText('Забрать посылку')).toBeInTheDocument();
    expect(screen.getByText(/с 25 августа/)).toBeInTheDocument();
  });

  it('сделанное сегодня — ниже и приглушено, вчерашнее только в архиве', async () => {
    renderWithProviders(<RemindersPage />, '/reminders');
    expect(await screen.findByText('Убрать вещи')).toBeInTheDocument();
    expect(screen.queryByText('Полить растения')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Вернуть: Убрать вещи' }));
    expect(reopened).toEqual(['r-done']);
  });
});
